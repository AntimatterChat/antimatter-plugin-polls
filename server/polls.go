// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	pkgerrors "github.com/pkg/errors"
)

const (
	// PostType is the type of the posts that show a poll. Their poll_id prop names the poll.
	PostType       = "custom_poll"
	PostPropPollID = "poll_id"

	// Websocket events, sent as custom_com.antimatterchat.polls_<event>
	wsEventPollUpdated = "poll_updated"
	wsEventMyVotes     = "poll_my_votes"
)

type apiError struct {
	status int
	err    error
}

func (e *apiError) Error() string {
	return e.err.Error()
}

func (e *apiError) Unwrap() error {
	return e.err
}

func newAPIError(status int, msg string) *apiError {
	return &apiError{status: status, err: errors.New(msg)}
}

// statusFor returns the HTTP status for an error returned by the plugin's operations.
func statusFor(err error) int {
	var apiErr *apiError
	switch {
	case errors.As(err, &apiErr):
		return apiErr.status
	case errors.Is(err, errPollNotFound):
		return http.StatusNotFound
	case errors.Is(err, errPollClosed):
		return http.StatusConflict
	case errors.Is(err, errInvalidOption):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// createPoll makes a poll and posts it in the channel, or in a thread of it, as the user.
func (p *Plugin) createPoll(userID, channelID, rootID string, req *PollRequest) (*Poll, error) {
	req.Normalize()
	if err := req.Validate(); err != nil {
		return nil, &apiError{status: http.StatusBadRequest, err: err}
	}

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		if appErr.StatusCode == http.StatusNotFound {
			return nil, newAPIError(http.StatusNotFound, "channel not found")
		}
		return nil, appErr
	}
	if !p.API.HasPermissionToChannel(userID, channel.Id, model.PermissionCreatePost) {
		return nil, newAPIError(http.StatusForbidden, "you can't post in this channel")
	}
	if channel.DeleteAt != 0 {
		return nil, newAPIError(http.StatusBadRequest, "archived channels can't have new polls")
	}
	if rootID != "" {
		root, appErr := p.API.GetPost(rootID)
		if appErr != nil || root.ChannelId != channel.Id {
			return nil, newAPIError(http.StatusBadRequest, "the thread isn't in this channel")
		}
		if root.RootId != "" {
			rootID = root.RootId
		}
	}

	now := p.now()
	poll := NewPoll(model.NewId(), channel.Id, userID, req, now)
	if err := p.store.CreatePoll(poll); err != nil {
		return nil, err
	}

	post := &model.Post{
		UserId:    userID,
		ChannelId: channel.Id,
		RootId:    rootID,
		Type:      PostType,
		Message:   poll.View("", now).FallbackMessage(),
	}
	post.AddProp(PostPropPollID, poll.ID)
	created, appErr := p.API.CreatePost(post)
	if appErr != nil {
		if err := p.store.DeletePoll(poll.ID); err != nil {
			p.API.LogWarn("Failed to delete the poll of a post that failed", "poll_id", poll.ID, "err", err.Error())
		}
		return nil, pkgerrors.Wrap(appErr, "failed to post the poll")
	}

	poll, _, err := p.store.UpdatePoll(poll.ID, func(poll *Poll) (bool, error) {
		poll.PostID = created.Id
		return true, nil
	})
	if err != nil {
		return nil, err
	}
	p.scheduleClose(poll)
	return poll, nil
}

// readablePoll returns a poll if the user can read its channel.
func (p *Plugin) readablePoll(userID, pollID string) (*Poll, error) {
	poll, err := p.store.GetPoll(pollID)
	if err != nil {
		return nil, err
	}
	if !p.API.HasPermissionToChannel(userID, poll.ChannelID, model.PermissionReadChannelContent) {
		// Same answer as for a missing poll, so that polls of other channels can't be probed
		return nil, errPollNotFound
	}
	return poll, nil
}

// vote adds (or, with add false, removes) the user's vote for an answer of a poll.
func (p *Plugin) vote(userID, pollID string, option int, add bool) (*PollView, error) {
	poll, err := p.readablePoll(userID, pollID)
	if err != nil {
		return nil, err
	}
	channel, appErr := p.API.GetChannel(poll.ChannelID)
	if appErr != nil {
		return nil, appErr
	}
	if channel.DeleteAt != 0 {
		return nil, newAPIError(http.StatusBadRequest, "the polls of archived channels can't be voted on")
	}

	now := p.now()
	poll, changed, err := p.store.UpdatePoll(poll.ID, func(poll *Poll) (bool, error) {
		if add {
			return poll.Vote(userID, option, now)
		}
		return poll.Unvote(userID, option, now)
	})
	if err != nil {
		return nil, err
	}
	if changed {
		p.publishPoll(poll, now)
		p.publishMyVotes(poll, userID)
	}
	return poll.View(userID, now), nil
}

// canClose returns whether the user can close the poll: its creator, the channel's admins, and
// those who can delete others' posts in the channel (e.g. team and system admins).
func (p *Plugin) canClose(userID string, poll *Poll) bool {
	if userID == poll.CreatorID {
		return true
	}
	if member, appErr := p.API.GetChannelMember(poll.ChannelID, userID); appErr == nil && member.SchemeAdmin {
		return true
	}
	return p.API.HasPermissionToChannel(userID, poll.ChannelID, model.PermissionDeleteOthersPosts)
}

// closePollAsUser closes a poll for a user allowed to.
func (p *Plugin) closePollAsUser(userID, pollID string) (*PollView, error) {
	poll, err := p.readablePoll(userID, pollID)
	if err != nil {
		return nil, err
	}
	if !p.canClose(userID, poll) {
		return nil, newAPIError(http.StatusForbidden, "only the poll's creator and the channel's admins can close it")
	}
	endedAlready := poll.IsClosed(p.now())
	poll, err = p.closePoll(poll.ID)
	if err != nil {
		return nil, err
	}
	// The job closing the poll at its end time isn't needed anymore. (Once it's due, it may be
	// running: it then closes the poll again, which changes nothing.)
	if !endedAlready {
		p.cancelClose(poll)
	}
	return poll.View(userID, p.now()), nil
}

// closePoll closes a poll, shows its results in its post's text and tells its channel. Closing a
// closed poll changes nothing.
func (p *Plugin) closePoll(pollID string) (*Poll, error) {
	now := p.now()
	poll, changed, err := p.store.UpdatePoll(pollID, func(poll *Poll) (bool, error) {
		return poll.Close(now), nil
	})
	if err != nil || !changed {
		return poll, err
	}

	p.updatePostMessage(poll, now)
	p.publishPoll(poll, now)
	return poll, nil
}

// updatePostMessage refreshes the text of the poll's post.
func (p *Plugin) updatePostMessage(poll *Poll, now int64) {
	if poll.PostID == "" {
		return
	}
	post, appErr := p.API.GetPost(poll.PostID)
	if appErr != nil {
		p.API.LogWarn("Failed to get the post of a poll", "poll_id", poll.ID, "err", appErr.Error())
		return
	}
	message := poll.View("", now).FallbackMessage()
	if post.DeleteAt != 0 || post.Message == message {
		return
	}
	post.Message = message
	if _, appErr := p.API.UpdatePost(post); appErr != nil {
		p.API.LogWarn("Failed to update the post of a poll", "poll_id", poll.ID, "err", appErr.Error())
	}
}

// publishPoll sends the poll, as seen by everyone, to the members of its channel.
func (p *Plugin) publishPoll(poll *Poll, now int64) {
	data, err := json.Marshal(poll.View("", now))
	if err != nil {
		p.API.LogWarn("Failed to encode a poll", "poll_id", poll.ID, "err", err.Error())
		return
	}
	p.API.PublishWebSocketEvent(wsEventPollUpdated, map[string]any{"poll": string(data)}, &model.WebsocketBroadcast{ChannelId: poll.ChannelID})
}

// publishMyVotes sends the user's votes on a poll to the user's other sessions, which can't tell
// them from the votes of anonymous polls.
func (p *Plugin) publishMyVotes(poll *Poll, userID string) {
	data, err := json.Marshal(poll.View(userID, p.now()).MyVotes)
	if err != nil {
		return
	}
	p.API.PublishWebSocketEvent(wsEventMyVotes, map[string]any{"poll_id": poll.ID, "my_votes": string(data)}, &model.WebsocketBroadcast{UserId: userID})
}
