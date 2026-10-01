// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func pollPost(pollID, channelID, userID string) *model.Post {
	post := &model.Post{Id: model.NewId(), Type: PostType, ChannelId: channelID, UserId: userID}
	post.AddProp(PostPropPollID, pollID)
	return post
}

func TestMessageWillBePosted(t *testing.T) {
	e := newTestEnv(t)
	pending := NewPoll(model.NewId(), channel.Id, alice, lunchPoll(), now)
	require.NoError(t, e.p.store.CreatePoll(pending))
	posted := e.addPoll(t, channel.Id, alice, lunchPoll())

	post, reason := e.p.MessageWillBePosted(&plugin.Context{}, pollPost(pending.ID, channel.Id, alice))
	assert.NotNil(t, post, "the plugin posts its new polls")
	assert.Empty(t, reason)

	for name, post := range map[string]*model.Post{
		"already posted poll": pollPost(posted.ID, channel.Id, alice),
		"other channel":       pollPost(pending.ID, model.NewId(), alice),
		"other user":          pollPost(pending.ID, channel.Id, bob),
		"unknown poll":        pollPost(model.NewId(), channel.Id, alice),
		"no poll":             {Type: PostType, ChannelId: channel.Id, UserId: alice},
	} {
		got, reason := e.p.MessageWillBePosted(&plugin.Context{}, post)
		assert.Nil(t, got, name)
		assert.NotEmpty(t, reason, name)
	}

	regular := &model.Post{Message: "hi"}
	got, _ := e.p.MessageWillBePosted(&plugin.Context{}, regular)
	assert.Same(t, regular, got)
}

func TestMessageWillBeUpdated(t *testing.T) {
	e := newTestEnv(t)
	old := pollPost("poll1", channel.Id, alice)

	edited := old.Clone()
	edited.Message = "edited"
	edited.Type = ""
	edited.AddProp(PostPropPollID, "poll2")
	got, reason := e.p.MessageWillBeUpdated(&plugin.Context{}, edited, old)
	require.Empty(t, reason)
	assert.Equal(t, PostType, got.Type)
	assert.Equal(t, "poll1", got.GetProp(PostPropPollID))
	assert.Equal(t, "edited", got.Message)

	got, reason = e.p.MessageWillBeUpdated(&plugin.Context{}, pollPost("poll1", channel.Id, alice), &model.Post{Message: "hi"})
	assert.Nil(t, got)
	assert.NotEmpty(t, reason)
}

func TestMessageHasBeenDeleted(t *testing.T) {
	e := newTestEnv(t)
	scheduler := withScheduler(e)
	req := lunchPoll()
	req.DurationMinutes = 10
	poll := e.addPoll(t, channel.Id, alice, req)
	post := pollPost(poll.ID, channel.Id, alice)

	// Another post pointing at the poll doesn't delete it
	e.p.MessageHasBeenDeleted(&plugin.Context{}, post)
	_, err := e.p.store.GetPoll(poll.ID)
	require.NoError(t, err)

	post.Id = poll.PostID
	e.p.MessageHasBeenDeleted(&plugin.Context{}, post)
	_, err = e.p.store.GetPoll(poll.ID)
	require.ErrorIs(t, err, errPollNotFound)
	assert.Equal(t, []string{closeJobKeyPrefix + poll.ID}, scheduler.canceled)
}
