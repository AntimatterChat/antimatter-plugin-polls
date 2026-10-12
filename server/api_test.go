// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

var (
	alice   = model.NewId()
	bob     = model.NewId()
	channel = &model.Channel{Id: model.NewId(), TeamId: model.NewId(), Type: model.ChannelTypeOpen}
)

func lunchPoll() *PollRequest {
	return &PollRequest{Question: "Lunch?", Options: []string{"Pizza", "Sushi"}}
}

// expectPublishedPoll expects the poll to be sent to the channel, and returns what was sent.
func (e *testEnv) expectPublishedPoll() *PollView {
	var view PollView
	e.api.On("PublishWebSocketEvent", wsEventPollUpdated, mock.Anything, &model.WebsocketBroadcast{ChannelId: channel.Id}).
		Run(func(args mock.Arguments) {
			payload := args.Get(1).(map[string]any)
			if err := json.Unmarshal([]byte(payload["poll"].(string)), &view); err != nil {
				panic(err)
			}
		}).Once()
	return &view
}

func TestAPIRequiresUser(t *testing.T) {
	e := newTestEnv(t)
	w := e.request(t, "", http.MethodGet, "/api/v1/polls/"+model.NewId(), nil)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAPICreatePoll(t *testing.T) {
	setup := func(t *testing.T, canPost bool) *testEnv {
		e := newTestEnv(t)
		e.api.On("GetChannel", channel.Id).Return(channel, nil)
		e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionCreatePost).Return(canPost)
		return e
	}

	t.Run("posts the poll as the user", func(t *testing.T) {
		e := setup(t, true)
		var posted *model.Post
		e.api.On("CreatePost", mock.Anything).Run(func(args mock.Arguments) {
			posted = args.Get(0).(*model.Post)
		}).Return(func(post *model.Post) *model.Post {
			created := post.Clone()
			created.Id = "post1"
			return created
		}, nil)

		w := e.request(t, alice, http.MethodPost, "/api/v1/polls", map[string]any{
			"channel_id": channel.Id, "question": " Lunch? ", "options": []string{"Pizza", "Sushi", ""},
			"multi": true, "anonymous": true, "duration_minutes": 60,
		})
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

		view := decode[PollView](t, w.Body.Bytes())
		assert.Equal(t, "Lunch?", view.Question)
		assert.Equal(t, []OptionView{{Text: "Pizza"}, {Text: "Sushi"}}, view.Options)
		assert.True(t, view.Multi)
		assert.True(t, view.Anonymous)
		assert.Equal(t, now+60*60*1000, view.EndAt)
		assert.Equal(t, "post1", view.PostID)
		assert.Equal(t, alice, view.CreatorID)

		require.NotNil(t, posted)
		assert.Equal(t, PostType, posted.Type)
		assert.Equal(t, alice, posted.UserId)
		assert.Equal(t, channel.Id, posted.ChannelId)
		assert.Equal(t, view.ID, posted.GetProp(PostPropPollID))
		assert.Equal(t, "**Poll:** Lunch?\n1. Pizza\n2. Sushi", posted.Message)

		poll, err := e.p.store.GetPoll(view.ID)
		require.NoError(t, err)
		assert.Equal(t, "post1", poll.PostID)
	})

	t.Run("posts in the thread", func(t *testing.T) {
		e := setup(t, true)
		e.api.On("GetPost", "reply").Return(&model.Post{Id: "reply", ChannelId: channel.Id, RootId: "root"}, nil)
		e.api.On("CreatePost", mock.MatchedBy(func(post *model.Post) bool { return post.RootId == "root" })).
			Return(&model.Post{Id: "post1"}, nil)

		body := map[string]any{"channel_id": channel.Id, "root_id": "reply", "question": "Q", "options": []string{"A", "B"}}
		w := e.request(t, alice, http.MethodPost, "/api/v1/polls", body)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	})

	t.Run("rejects a thread of another channel", func(t *testing.T) {
		e := setup(t, true)
		e.api.On("GetPost", "root").Return(&model.Post{Id: "root", ChannelId: model.NewId()}, nil)

		body := map[string]any{"channel_id": channel.Id, "root_id": "root", "question": "Q", "options": []string{"A", "B"}}
		w := e.request(t, alice, http.MethodPost, "/api/v1/polls", body)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("needs the permission to post", func(t *testing.T) {
		e := setup(t, false)
		w := e.request(t, alice, http.MethodPost, "/api/v1/polls", map[string]any{"channel_id": channel.Id, "question": "Q", "options": []string{"A", "B"}})
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("rejects invalid polls", func(t *testing.T) {
		e := newTestEnv(t)
		w := e.request(t, alice, http.MethodPost, "/api/v1/polls", map[string]any{"channel_id": channel.Id, "question": "Q", "options": []string{"A"}})
		require.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Body.String(), "at least 2 answers")
	})

	t.Run("forgets the poll when posting fails", func(t *testing.T) {
		e := setup(t, true)
		e.api.On("CreatePost", mock.Anything).Return(nil, model.NewAppError("CreatePost", "boom", nil, "", http.StatusInternalServerError))

		w := e.request(t, alice, http.MethodPost, "/api/v1/polls", map[string]any{"channel_id": channel.Id, "question": "Q", "options": []string{"A", "B"}})
		require.Equal(t, http.StatusInternalServerError, w.Code)
		assert.NotContains(t, w.Body.String(), "boom")
		assert.Empty(t, e.kv.data)
	})
}

func TestAPIGetPoll(t *testing.T) {
	e := newTestEnv(t)
	poll := e.addPoll(t, channel.Id, alice, lunchPoll())
	_, _, err := e.p.store.UpdatePoll(poll.ID, func(p *Poll) (bool, error) { return p.Vote(bob, 1, now) })
	require.NoError(t, err)

	e.api.On("HasPermissionToChannel", bob, channel.Id, model.PermissionReadChannelContent).Return(true)
	e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionReadChannelContent).Return(false)

	w := e.request(t, bob, http.MethodGet, "/api/v1/polls/"+poll.ID, nil)
	require.Equal(t, http.StatusOK, w.Code)
	view := decode[PollView](t, w.Body.Bytes())
	assert.Equal(t, []int{1}, view.MyVotes)
	assert.Equal(t, []string{bob}, view.Options[1].Voters)

	w = e.request(t, alice, http.MethodGet, "/api/v1/polls/"+poll.ID, nil)
	require.Equal(t, http.StatusNotFound, w.Code, "polls of channels the user can't read look missing")

	w = e.request(t, bob, http.MethodGet, "/api/v1/polls/"+model.NewId(), nil)
	require.Equal(t, http.StatusNotFound, w.Code)
}

func TestAPIVote(t *testing.T) {
	setup := func(t *testing.T, req *PollRequest) (*testEnv, *Poll) {
		e := newTestEnv(t)
		poll := e.addPoll(t, channel.Id, alice, req)
		e.api.On("HasPermissionToChannel", bob, channel.Id, model.PermissionReadChannelContent).Return(true).Maybe()
		e.api.On("GetChannel", channel.Id).Return(channel, nil).Maybe()
		return e, poll
	}
	expectMyVotes := func(e *testEnv, poll *Poll, votes string) {
		e.api.On("PublishWebSocketEvent", wsEventMyVotes, map[string]any{"poll_id": poll.ID, "my_votes": votes},
			&model.WebsocketBroadcast{UserId: bob}).Once()
	}

	t.Run("vote and unvote", func(t *testing.T) {
		e, poll := setup(t, lunchPoll())

		sent := e.expectPublishedPoll()
		expectMyVotes(e, poll, "[1]")
		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{"option": 1})
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		view := decode[PollView](t, w.Body.Bytes())
		assert.Equal(t, []int{1}, view.MyVotes)
		assert.Equal(t, 1, view.VoterCount)
		assert.Equal(t, []string{bob}, sent.Options[1].Voters)
		assert.Equal(t, []int{}, sent.MyVotes, "what the channel gets has nobody's own votes")

		sent = e.expectPublishedPoll()
		expectMyVotes(e, poll, "[]")
		w = e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/unvote", map[string]any{"option": 1})
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		assert.Equal(t, 0, decode[PollView](t, w.Body.Bytes()).VoterCount)
		assert.Equal(t, 0, sent.VoterCount)

		// Nothing changes, nothing is sent
		w = e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/unvote", map[string]any{"option": 1})
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	})

	t.Run("anonymous polls tell nobody who voted", func(t *testing.T) {
		req := lunchPoll()
		req.Anonymous = true
		e, poll := setup(t, req)

		sent := e.expectPublishedPoll()
		expectMyVotes(e, poll, "[0]")
		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{"option": 0})
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		assert.Equal(t, []int{0}, decode[PollView](t, w.Body.Bytes()).MyVotes)
		assert.Equal(t, 1, sent.Options[0].Votes)
		assert.Empty(t, sent.Options[0].Voters)
	})

	t.Run("rejects invalid votes", func(t *testing.T) {
		e, poll := setup(t, lunchPoll())

		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{"option": 2})
		require.Equal(t, http.StatusBadRequest, w.Code)
		w = e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{})
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("rejects votes on closed polls", func(t *testing.T) {
		req := lunchPoll()
		req.DurationMinutes = 1
		e, poll := setup(t, req)
		e.now += 60 * 1000

		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{"option": 0})
		require.Equal(t, http.StatusConflict, w.Code)
	})

	t.Run("rejects votes from outside the channel", func(t *testing.T) {
		e := newTestEnv(t)
		poll := e.addPoll(t, channel.Id, alice, lunchPoll())
		e.api.On("HasPermissionToChannel", bob, channel.Id, model.PermissionReadChannelContent).Return(false)

		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{"option": 0})
		require.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("rejects votes in archived channels", func(t *testing.T) {
		e := newTestEnv(t)
		archived := channel.DeepCopy()
		archived.DeleteAt = now
		poll := e.addPoll(t, archived.Id, alice, lunchPoll())
		e.api.On("HasPermissionToChannel", bob, archived.Id, model.PermissionReadChannelContent).Return(true)
		e.api.On("GetChannel", archived.Id).Return(archived, nil)

		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/vote", map[string]any{"option": 0})
		require.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestAPIClosePoll(t *testing.T) {
	carol := model.NewId()

	setup := func(t *testing.T) (*testEnv, *Poll) {
		e := newTestEnv(t)
		poll := e.addPoll(t, channel.Id, alice, lunchPoll())
		_, _, err := e.p.store.UpdatePoll(poll.ID, func(p *Poll) (bool, error) { return p.Vote(bob, 0, now) })
		require.NoError(t, err)
		e.api.On("HasPermissionToChannel", mock.Anything, channel.Id, model.PermissionReadChannelContent).Return(true)
		return e, poll
	}
	expectClosed := func(t *testing.T, e *testEnv, poll *Poll) {
		e.api.On("GetPost", poll.PostID).Return(&model.Post{Id: poll.PostID, Message: "**Poll:** Lunch?"}, nil)
		e.api.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.Id == poll.PostID && post.Message == "**Poll (closed):** Lunch?\n1. Pizza — 1 vote (100%)\n2. Sushi — 0 votes (0%)"
		})).Return(&model.Post{}, nil).Once()
		sent := e.expectPublishedPoll()
		t.Cleanup(func() {
			assert.True(t, sent.Closed)
			assert.Equal(t, now, sent.ClosedAt)
		})
	}

	t.Run("by its creator", func(t *testing.T) {
		e, poll := setup(t)
		expectClosed(t, e, poll)

		w := e.request(t, alice, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		assert.True(t, decode[PollView](t, w.Body.Bytes()).Closed)

		// Closing again changes nothing
		w = e.request(t, alice, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	})

	t.Run("by a channel admin", func(t *testing.T) {
		e, poll := setup(t)
		e.api.On("GetChannelMember", channel.Id, carol).Return(&model.ChannelMember{SchemeAdmin: true}, nil)
		expectClosed(t, e, poll)

		w := e.request(t, carol, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	})

	t.Run("by someone who can delete others' posts", func(t *testing.T) {
		e, poll := setup(t)
		e.api.On("GetChannelMember", channel.Id, carol).Return(&model.ChannelMember{}, nil)
		e.api.On("HasPermissionToChannel", carol, channel.Id, model.PermissionDeleteOthersPosts).Return(true)
		expectClosed(t, e, poll)

		w := e.request(t, carol, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	})

	t.Run("not by other members", func(t *testing.T) {
		e, poll := setup(t)
		e.api.On("GetChannelMember", channel.Id, bob).Return(&model.ChannelMember{}, nil)
		e.api.On("HasPermissionToChannel", bob, channel.Id, model.PermissionDeleteOthersPosts).Return(false)

		w := e.request(t, bob, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
		require.Equal(t, http.StatusForbidden, w.Code)

		saved, err := e.p.store.GetPoll(poll.ID)
		require.NoError(t, err)
		assert.Zero(t, saved.ClosedAt)
	})
}
