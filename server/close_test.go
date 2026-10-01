// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// fakeScheduler records the scheduled jobs.
type fakeScheduler struct {
	mu       sync.Mutex
	jobs     map[string]time.Time
	canceled []string
}

func (f *fakeScheduler) ScheduleOnce(key string, runAt time.Time, _ any) (*cluster.JobOnce, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.jobs[key] = runAt
	return nil, nil
}

func (f *fakeScheduler) Cancel(key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.jobs, key)
	f.canceled = append(f.canceled, key)
}

func withScheduler(e *testEnv) *fakeScheduler {
	scheduler := &fakeScheduler{jobs: map[string]time.Time{}}
	e.p.closer = scheduler
	return scheduler
}

func TestClosePollAtItsEnd(t *testing.T) {
	e := newTestEnv(t)
	scheduler := withScheduler(e)
	e.api.On("GetChannel", channel.Id).Return(channel, nil)
	e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionCreatePost).Return(true)
	e.api.On("CreatePost", mock.Anything).Return(&model.Post{Id: "post1"}, nil)

	w := e.request(t, alice, http.MethodPost, "/api/v1/polls", map[string]any{
		"channel_id": channel.Id, "question": "Lunch?", "options": []string{"Pizza", "Sushi"}, "duration_minutes": 30,
	})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	view := decode[PollView](t, w.Body.Bytes())

	key := closeJobKeyPrefix + view.ID
	require.Equal(t, map[string]time.Time{key: time.UnixMilli(now + 30*60*1000)}, scheduler.jobs)

	// The job runs late: the poll closes at its end time
	e.now += 31 * 60 * 1000
	e.api.On("GetPost", "post1").Return(&model.Post{Id: "post1", Message: "**Poll:** Lunch?"}, nil)
	e.api.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
		return post.Message == "**Poll (closed):** Lunch?\n1. Pizza — 0 votes (0%)\n2. Sushi — 0 votes (0%)"
	})).Return(&model.Post{}, nil).Once()
	sent := e.expectPublishedPoll()

	e.p.runCloseJob(key, nil)

	assert.True(t, sent.Closed)
	poll, err := e.p.store.GetPoll(view.ID)
	require.NoError(t, err)
	assert.Equal(t, now+30*60*1000, poll.ClosedAt)
	assert.Empty(t, scheduler.canceled, "the job doesn't cancel itself")

	// Running it again changes nothing
	e.p.runCloseJob(key, nil)

	// Jobs of deleted polls do nothing
	e.p.runCloseJob(closeJobKeyPrefix+model.NewId(), nil)
}

func TestClosePollBeforeItsEnd(t *testing.T) {
	e := newTestEnv(t)
	scheduler := withScheduler(e)
	req := lunchPoll()
	req.DurationMinutes = 60
	poll := e.addPoll(t, channel.Id, alice, req)
	e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionReadChannelContent).Return(true)
	e.api.On("GetPost", poll.PostID).Return(&model.Post{Id: poll.PostID}, nil)
	e.api.On("UpdatePost", mock.Anything).Return(&model.Post{}, nil)
	e.expectPublishedPoll()

	w := e.request(t, alice, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, []string{closeJobKeyPrefix + poll.ID}, scheduler.canceled)
}

func TestClosePollWithoutEnd(t *testing.T) {
	e := newTestEnv(t)
	scheduler := withScheduler(e)
	poll := e.addPoll(t, channel.Id, alice, lunchPoll())
	e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionReadChannelContent).Return(true)
	e.api.On("GetPost", poll.PostID).Return(&model.Post{Id: poll.PostID, DeleteAt: now}, nil)
	e.expectPublishedPoll()

	w := e.request(t, alice, http.MethodPost, "/api/v1/polls/"+poll.ID+"/close", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Empty(t, scheduler.canceled)
}
