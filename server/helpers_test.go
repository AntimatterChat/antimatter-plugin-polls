// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// fakeKV is an in-memory kvAPI.
type fakeKV struct {
	mu   sync.Mutex
	data map[string][]byte

	// beforeSet, when set, runs before every set, without the lock, e.g. to make a concurrent update.
	beforeSet func(key string)
}

func newFakeKV() *fakeKV {
	return &fakeKV{data: map[string][]byte{}}
}

func (f *fakeKV) KVGet(key string) ([]byte, *model.AppError) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if v, ok := f.data[key]; ok {
		return bytes.Clone(v), nil
	}
	return nil, nil
}

func (f *fakeKV) KVSetWithOptions(key string, value []byte, options model.PluginKVSetOptions) (bool, *model.AppError) {
	if f.beforeSet != nil {
		f.beforeSet(key)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if options.Atomic {
		current, exists := f.data[key]
		if options.OldValue == nil && exists || options.OldValue != nil && (!exists || !bytes.Equal(current, options.OldValue)) {
			return false, nil
		}
	}
	if value == nil {
		delete(f.data, key)
	} else {
		f.data[key] = bytes.Clone(value)
	}
	return true, nil
}

type testEnv struct {
	p   *Plugin
	api *plugintest.API
	kv  *fakeKV
	now int64
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()

	api := &plugintest.API{}
	t.Cleanup(func() { api.AssertExpectations(t) })
	// Allow logging with any number of key/value pairs
	for _, level := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
		for n := 1; n <= 7; n += 2 {
			args := make([]any, n)
			for i := range args {
				args[i] = mock.Anything
			}
			api.On(level, args...).Maybe()
		}
	}

	kv := newFakeKV()
	e := &testEnv{api: api, kv: kv, now: now}
	e.p = &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: api},
		configuration:    &configuration{},
		store:            NewStore(kv),
		now:              func() int64 { return e.now },
	}
	e.p.router = e.p.newRouter()
	return e
}

// request serves a request to the plugin's REST API as the given user.
func (e *testEnv) request(t *testing.T, userID, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()

	reqBody := bytes.NewReader(nil)
	if body != nil {
		data, err := json.Marshal(body)
		require.NoError(t, err)
		reqBody = bytes.NewReader(data)
	}
	r := httptest.NewRequest(method, path, reqBody)
	if userID != "" {
		r.Header.Set("Mattermost-User-Id", userID)
	}
	w := httptest.NewRecorder()
	e.p.ServeHTTP(&plugin.Context{}, w, r)
	return w
}

// addPoll stores an open poll of the channel, with a post.
func (e *testEnv) addPoll(t *testing.T, channelID, creatorID string, req *PollRequest) *Poll {
	t.Helper()
	poll := NewPoll(model.NewId(), channelID, creatorID, req, e.now)
	poll.PostID = model.NewId()
	require.NoError(t, e.p.store.CreatePoll(poll))
	return poll
}

func decode[T any](t *testing.T, body []byte) T {
	t.Helper()
	var v T
	require.NoError(t, json.Unmarshal(body, &v))
	return v
}
