// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// MessageWillBePosted only lets the plugin post polls: a poll post must be the first post of a
// poll of the same channel and user.
func (p *Plugin) MessageWillBePosted(_ *plugin.Context, post *model.Post) (*model.Post, string) {
	if post.Type != PostType {
		return post, ""
	}
	pollID, _ := post.GetProp(PostPropPollID).(string)
	poll, err := p.store.GetPoll(pollID)
	if err != nil || poll.PostID != "" || poll.ChannelID != post.ChannelId || poll.CreatorID != post.UserId {
		return nil, "Polls can only be created with /poll or the poll creation dialog."
	}
	return post, ""
}

// MessageWillBeUpdated keeps poll posts tied to their poll, and other posts from becoming polls.
func (p *Plugin) MessageWillBeUpdated(_ *plugin.Context, newPost, oldPost *model.Post) (*model.Post, string) {
	if oldPost.Type != PostType {
		if newPost.Type == PostType {
			return nil, "Messages can't be turned into polls."
		}
		return newPost, ""
	}
	newPost.Type = PostType
	newPost.AddProp(PostPropPollID, oldPost.GetProp(PostPropPollID))
	return newPost, ""
}

// MessageHasBeenDeleted forgets the poll of a deleted poll post.
func (p *Plugin) MessageHasBeenDeleted(_ *plugin.Context, post *model.Post) {
	if post.Type != PostType {
		return
	}
	pollID, _ := post.GetProp(PostPropPollID).(string)
	poll, err := p.store.GetPoll(pollID)
	if err != nil || poll.PostID != post.Id {
		return
	}
	if !poll.IsClosed(p.now()) {
		p.cancelClose(poll)
	}
	if err := p.store.DeletePoll(poll.ID); err != nil {
		p.API.LogWarn("Failed to delete the poll of a deleted post", "poll_id", poll.ID, "err", err.Error())
	}
}
