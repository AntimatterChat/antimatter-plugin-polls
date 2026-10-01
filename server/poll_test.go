// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const now = int64(1_700_000_000_000)

func newTestPoll(multi, anonymous bool) *Poll {
	return NewPoll("poll1", "channel1", "creator", &PollRequest{
		Question:  "Which Friday works for demo day?",
		Options:   []string{"November 6", "November 13", "November 20"},
		Multi:     multi,
		Anonymous: anonymous,
	}, now)
}

func TestPollRequestValidate(t *testing.T) {
	valid := func() *PollRequest {
		return &PollRequest{Question: " Lunch? ", Options: []string{" Pizza ", "", "Sushi"}, DurationMinutes: 60}
	}

	t.Run("normalizes and accepts a valid request", func(t *testing.T) {
		req := valid()
		req.Normalize()
		require.NoError(t, req.Validate())
		assert.Equal(t, "Lunch?", req.Question)
		assert.Equal(t, []string{"Pizza", "Sushi"}, req.Options)
	})

	for name, tc := range map[string]struct {
		change func(r *PollRequest)
		err    string
	}{
		"empty question":     {func(r *PollRequest) { r.Question = "  " }, "question is empty"},
		"long question":      {func(r *PollRequest) { r.Question = strings.Repeat("é", MaxQuestionLength+1) }, "question is longer"},
		"one answer":         {func(r *PollRequest) { r.Options = []string{"Pizza", " "} }, "at least 2 answers"},
		"too many answers":   {func(r *PollRequest) { r.Options = strings.Split("a b c d e f g h i j k", " ") }, "up to 10 answers"},
		"long answer":        {func(r *PollRequest) { r.Options[0] = strings.Repeat("x", MaxOptionLength+1) }, "is longer than 80"},
		"duplicate answers":  {func(r *PollRequest) { r.Options = []string{"Pizza", "pizza "} }, "given twice"},
		"negative duration":  {func(r *PollRequest) { r.DurationMinutes = -1 }, "up to 30 days"},
		"too long duration":  {func(r *PollRequest) { r.DurationMinutes = MaxDurationMinutes + 1 }, "up to 30 days"},
		"max length allowed": {func(r *PollRequest) { r.Question = strings.Repeat("é", MaxQuestionLength) }, ""},
	} {
		t.Run(name, func(t *testing.T) {
			req := valid()
			tc.change(req)
			req.Normalize()
			err := req.Validate()
			if tc.err == "" {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.err)
		})
	}
}

func TestNewPoll(t *testing.T) {
	poll := NewPoll("id", "channel", "user", &PollRequest{Question: "Q", Options: []string{"A", "B"}, DurationMinutes: 90}, now)
	assert.Equal(t, now+90*60*1000, poll.EndAt)
	assert.False(t, poll.IsClosed(now))
	assert.True(t, poll.IsClosed(poll.EndAt))

	noEnd := NewPoll("id", "channel", "user", &PollRequest{Question: "Q", Options: []string{"A", "B"}}, now)
	assert.Zero(t, noEnd.EndAt)
	assert.False(t, noEnd.IsClosed(now+365*24*3600*1000))
}

func TestPollVoteSingleChoice(t *testing.T) {
	poll := newTestPoll(false, false)

	changed, err := poll.Vote("alice", 0, now)
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, []int{0}, poll.Votes["alice"])

	changed, err = poll.Vote("alice", 0, now)
	require.NoError(t, err)
	assert.False(t, changed, "voting again for the same answer changes nothing")

	changed, err = poll.Vote("alice", 2, now)
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, []int{2}, poll.Votes["alice"], "a new vote replaces the previous one")

	changed, err = poll.Unvote("alice", 0, now)
	require.NoError(t, err)
	assert.False(t, changed, "removing a vote the user doesn't have changes nothing")

	changed, err = poll.Unvote("alice", 2, now)
	require.NoError(t, err)
	assert.True(t, changed)
	assert.NotContains(t, poll.Votes, "alice")
}

func TestPollVoteMultipleChoice(t *testing.T) {
	poll := newTestPoll(true, false)

	for _, option := range []int{2, 0, 2} {
		_, err := poll.Vote("alice", option, now)
		require.NoError(t, err)
	}
	assert.Equal(t, []int{0, 2}, poll.Votes["alice"], "votes add up, sorted, without duplicates")

	changed, err := poll.Unvote("alice", 0, now)
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, []int{2}, poll.Votes["alice"])
}

func TestPollVoteErrors(t *testing.T) {
	poll := newTestPoll(false, false)
	poll.EndAt = now + 1000

	_, err := poll.Vote("alice", 3, now)
	require.ErrorIs(t, err, errInvalidOption)
	_, err = poll.Vote("alice", -1, now)
	require.ErrorIs(t, err, errInvalidOption)
	_, err = poll.Unvote("alice", 7, now)
	require.ErrorIs(t, err, errInvalidOption)

	_, err = poll.Vote("alice", 0, now+1000)
	require.ErrorIs(t, err, errPollClosed, "a poll past its end takes no votes, closed or not")

	poll.EndAt = 0
	require.True(t, poll.Close(now))
	_, err = poll.Vote("alice", 0, now)
	require.ErrorIs(t, err, errPollClosed)
	_, err = poll.Unvote("alice", 0, now)
	require.ErrorIs(t, err, errPollClosed)
}

func TestPollClose(t *testing.T) {
	poll := newTestPoll(false, false)
	assert.True(t, poll.Close(now+5))
	assert.Equal(t, now+5, poll.ClosedAt)
	assert.False(t, poll.Close(now+10), "closing twice does nothing")
	assert.Equal(t, now+5, poll.ClosedAt)

	ended := newTestPoll(false, false)
	ended.EndAt = now + 1000
	assert.True(t, ended.Close(now+60_000))
	assert.Equal(t, now+1000, ended.ClosedAt, "a poll that reached its end closes at its end")
}

func TestPollView(t *testing.T) {
	poll := newTestPoll(true, false)
	for user, options := range map[string][]int{"alice": {0, 1}, "bob": {0}, "carol": {2}} {
		for _, option := range options {
			_, err := poll.Vote(user, option, now)
			require.NoError(t, err)
		}
	}

	view := poll.View("alice", now)
	assert.Equal(t, 3, view.VoterCount)
	assert.Equal(t, []int{0, 1}, view.MyVotes)
	assert.False(t, view.Closed)
	assert.Equal(t, OptionView{Text: "November 6", Votes: 2, Voters: []string{"alice", "bob"}}, view.Options[0])
	assert.Equal(t, OptionView{Text: "November 13", Votes: 1, Voters: []string{"alice"}}, view.Options[1])
	assert.Equal(t, 67, view.Percent(0), "shares are of the voters, rounded")
	assert.Equal(t, 33, view.Percent(1))

	everyone := poll.View("", now)
	assert.Equal(t, []int{}, everyone.MyVotes, "views for everyone tell nobody's votes")

	poll.Anonymous = true
	anonymous := poll.View("bob", now)
	assert.Equal(t, []int{0}, anonymous.MyVotes, "voters still see their own votes")
	for _, option := range anonymous.Options {
		assert.Empty(t, option.Voters, "anonymous polls don't tell who voted")
	}
	assert.Equal(t, 2, anonymous.Options[0].Votes)

	poll.EndAt = now + 10
	ended := poll.View("", now+10)
	assert.True(t, ended.Closed)
	assert.Equal(t, now+10, ended.ClosedAt)

	assert.Zero(t, newTestPoll(false, false).View("", now).Percent(0), "no votes, no shares")
}

func TestPollFallbackMessage(t *testing.T) {
	poll := newTestPoll(false, false)
	_, err := poll.Vote("alice", 1, now)
	require.NoError(t, err)

	assert.Equal(t, "**Poll:** Which Friday works for demo day?\n1. November 6\n2. November 13\n3. November 20",
		poll.View("", now).FallbackMessage())

	poll.Close(now)
	assert.Equal(t, "**Poll (closed):** Which Friday works for demo day?\n1. November 6 — 0 votes (0%)\n2. November 13 — 1 vote (100%)\n3. November 20 — 0 votes (0%)",
		poll.View("", now).FallbackMessage())
}
