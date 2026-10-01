// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"net/http"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestParsePollCommand(t *testing.T) {
	for name, tc := range map[string]struct {
		args string
		want *PollRequest
		err  string
	}{
		"question and answers": {
			args: `"Which Friday works?" "November 6" "November 13"`,
			want: &PollRequest{Question: "Which Friday works?", Options: []string{"November 6", "November 13"}},
		},
		"options anywhere": {
			args: `--multi "Lunch?" --duration 1h30m "Pizza" "Sushi" --anonymous`,
			want: &PollRequest{Question: "Lunch?", Options: []string{"Pizza", "Sushi"}, Multi: true, Anonymous: true, DurationMinutes: 90},
		},
		"duration with equals": {
			args: `"Lunch?" "Pizza" "Sushi" --duration=1w`,
			want: &PollRequest{Question: "Lunch?", Options: []string{"Pizza", "Sushi"}, DurationMinutes: 7 * 24 * 60},
		},
		"curly quotes and bare words": {
			args: `“Lunch?” “Pizza place” Sushi`,
			want: &PollRequest{Question: "Lunch?", Options: []string{"Pizza place", "Sushi"}},
		},
		"quoted dashes are text": {
			args: `"Lunch?" "--multi" "Sushi"`,
			want: &PollRequest{Question: "Lunch?", Options: []string{"--multi", "Sushi"}},
		},
		"unclosed quote":   {args: `"Lunch? "Pizza" "Sushi`, err: "quote isn't closed"},
		"no answers":       {args: `"Lunch?"`, err: "at least 2 answers"},
		"only options":     {args: `--multi`, err: "question is missing"},
		"unknown option":   {args: `"Lunch?" "Pizza" "Sushi" --secret`, err: "unknown option --secret"},
		"missing duration": {args: `"Lunch?" "Pizza" "Sushi" --duration`, err: "needs a duration"},
		"bad duration":     {args: `"Lunch?" "Pizza" "Sushi" --duration soon`, err: "invalid duration"},
		"too long":         {args: `"Lunch?" "Pizza" "Sushi" --duration 31d`, err: "up to 30 days"},
	} {
		t.Run(name, func(t *testing.T) {
			req, err := parsePollCommand(tc.args)
			if tc.err != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, req)
		})
	}
}

func TestParseDuration(t *testing.T) {
	for s, want := range map[string]int{"30m": 30, "45min": 45, "8h": 480, "3d": 4320, "1w": 10080, "1h30m": 90, "2d12h": 3600} {
		got, err := parseDuration(s)
		require.NoError(t, err, s)
		assert.Equal(t, want, got, s)
	}
	for _, s := range []string{"", "0m", "1", "h", "1y", "1h foo", "x1h", "99999999999999999999m"} {
		_, err := parseDuration(s)
		assert.Error(t, err, s)
	}
}

func TestExecuteCommand(t *testing.T) {
	args := func(command string) *model.CommandArgs {
		return &model.CommandArgs{Command: command, UserId: alice, ChannelId: channel.Id, RootId: "", TriggerId: "trigger"}
	}

	t.Run("creates the poll", func(t *testing.T) {
		e := newTestEnv(t)
		e.api.On("GetChannel", channel.Id).Return(channel, nil)
		e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionCreatePost).Return(true)
		e.api.On("CreatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.Type == PostType && post.Message == "**Poll:** Lunch?\n1. Pizza\n2. Sushi"
		})).Return(&model.Post{Id: "post1"}, nil)

		resp, appErr := e.p.ExecuteCommand(&plugin.Context{}, args(`/poll "Lunch?" "Pizza" "Sushi"`))
		require.Nil(t, appErr)
		assert.Empty(t, resp.Text)
	})

	t.Run("explains errors", func(t *testing.T) {
		e := newTestEnv(t)
		resp, appErr := e.p.ExecuteCommand(&plugin.Context{}, args(`/poll "Lunch?"`))
		require.Nil(t, appErr)
		assert.Equal(t, model.CommandResponseTypeEphemeral, resp.ResponseType)
		assert.Contains(t, resp.Text, "at least 2 answers")
		assert.Contains(t, resp.Text, "Usage")
	})

	t.Run("explains permission errors", func(t *testing.T) {
		e := newTestEnv(t)
		e.api.On("GetChannel", channel.Id).Return(channel, nil)
		e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionCreatePost).Return(false)

		resp, _ := e.p.ExecuteCommand(&plugin.Context{}, args(`/poll "Lunch?" "Pizza" "Sushi"`))
		assert.Equal(t, "The poll couldn't be created: you can't post in this channel.", resp.Text)
	})

	t.Run("help", func(t *testing.T) {
		e := newTestEnv(t)
		resp, _ := e.p.ExecuteCommand(&plugin.Context{}, args(`/poll help`))
		assert.Contains(t, resp.Text, "--anonymous")
	})

	t.Run("opens the dialog without arguments", func(t *testing.T) {
		e := newTestEnv(t)
		cmd := args("/poll")
		cmd.RootId = "root"
		e.api.On("OpenInteractiveDialog", mock.MatchedBy(func(req model.OpenDialogRequest) bool {
			return req.TriggerId == "trigger" && req.URL == "/plugins/com.antimatterchat.polls/api/v1/dialog" &&
				req.Dialog.CallbackId == dialogCallbackID && req.Dialog.State == "root"
		})).Return(nil)

		resp, appErr := e.p.ExecuteCommand(&plugin.Context{}, cmd)
		require.Nil(t, appErr)
		assert.Empty(t, resp.Text)
	})
}

func TestDialogSubmission(t *testing.T) {
	submit := func(submission map[string]any) map[string]any {
		return map[string]any{
			"callback_id": dialogCallbackID, "channel_id": channel.Id, "state": "", "user_id": "ignored",
			"submission": submission,
		}
	}

	t.Run("creates the poll", func(t *testing.T) {
		e := newTestEnv(t)
		e.api.On("GetChannel", channel.Id).Return(channel, nil)
		e.api.On("HasPermissionToChannel", alice, channel.Id, model.PermissionCreatePost).Return(true)
		e.api.On("CreatePost", mock.MatchedBy(func(post *model.Post) bool { return post.UserId == alice })).Return(&model.Post{Id: "post1"}, nil)

		w := e.request(t, alice, http.MethodPost, "/api/v1/dialog", submit(map[string]any{
			"question": "Lunch?", "options": "Pizza\n\n Sushi \n", "multi": true, "anonymous": false, "duration": "60",
		}))
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		assert.Empty(t, w.Body.String())

		require.Len(t, e.kv.data, 1)
		for _, data := range e.kv.data {
			assert.Contains(t, string(data), `"options":["Pizza","Sushi"],"multi":true`)
		}
	})

	t.Run("points at the invalid field", func(t *testing.T) {
		e := newTestEnv(t)
		w := e.request(t, alice, http.MethodPost, "/api/v1/dialog", submit(map[string]any{"question": "Lunch?", "options": "Pizza", "duration": "0"}))
		require.Equal(t, http.StatusOK, w.Code)
		resp := decode[model.SubmitDialogResponse](t, w.Body.Bytes())
		assert.Equal(t, map[string]string{"options": "A poll needs at least 2 answers."}, resp.Errors)

		w = e.request(t, alice, http.MethodPost, "/api/v1/dialog", submit(map[string]any{"question": " ", "options": "A\nB"}))
		resp = decode[model.SubmitDialogResponse](t, w.Body.Bytes())
		assert.Equal(t, map[string]string{"question": "The question is empty."}, resp.Errors)
	})
}
