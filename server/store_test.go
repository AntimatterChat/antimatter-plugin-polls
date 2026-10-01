// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStoreCreateAndGetPoll(t *testing.T) {
	store := NewStore(newFakeKV())

	_, err := store.GetPoll("poll1")
	require.ErrorIs(t, err, errPollNotFound)

	poll := newTestPoll(false, true)
	require.NoError(t, store.CreatePoll(poll))
	require.Error(t, store.CreatePoll(poll), "a poll is only created once")

	got, err := store.GetPoll("poll1")
	require.NoError(t, err)
	assert.Equal(t, poll, got)

	require.NoError(t, store.DeletePoll("poll1"))
	_, err = store.GetPoll("poll1")
	require.ErrorIs(t, err, errPollNotFound)
}

func TestStoreUpdatePoll(t *testing.T) {
	store := NewStore(newFakeKV())
	require.NoError(t, store.CreatePoll(newTestPoll(true, false)))

	poll, changed, err := store.UpdatePoll("poll1", func(p *Poll) (bool, error) {
		return p.Vote("alice", 1, now)
	})
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, []int{1}, poll.Votes["alice"])

	_, changed, err = store.UpdatePoll("poll1", func(p *Poll) (bool, error) {
		return p.Vote("alice", 1, now)
	})
	require.NoError(t, err)
	assert.False(t, changed)

	_, _, err = store.UpdatePoll("poll1", func(p *Poll) (bool, error) {
		return p.Vote("alice", 9, now)
	})
	require.ErrorIs(t, err, errInvalidOption)

	_, _, err = store.UpdatePoll("nope", func(p *Poll) (bool, error) { return true, nil })
	require.ErrorIs(t, err, errPollNotFound)
}

func TestStoreUpdatePollKeepsConcurrentVotes(t *testing.T) {
	kv := newFakeKV()
	store := NewStore(kv)
	require.NoError(t, store.CreatePoll(newTestPoll(true, false)))

	// Bob votes while Alice's vote is being saved: Alice's update is retried on top of Bob's vote.
	bobVoted := false
	kv.beforeSet = func(string) {
		if bobVoted {
			return
		}
		bobVoted = true
		_, _, err := store.UpdatePoll("poll1", func(p *Poll) (bool, error) {
			return p.Vote("bob", 0, now)
		})
		require.NoError(t, err)
	}

	poll, changed, err := store.UpdatePoll("poll1", func(p *Poll) (bool, error) {
		return p.Vote("alice", 2, now)
	})
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, map[string][]int{"alice": {2}, "bob": {0}}, poll.Votes)

	saved, err := store.GetPoll("poll1")
	require.NoError(t, err)
	assert.Equal(t, poll.Votes, saved.Votes)
}

func TestStoreUpdatePollGivesUpUnderContention(t *testing.T) {
	kv := newFakeKV()
	store := NewStore(kv)
	require.NoError(t, store.CreatePoll(newTestPoll(true, false)))

	// Every save loses the race
	n := 0
	kv.beforeSet = func(key string) {
		n++
		kv.mu.Lock()
		kv.data[key] = append(kv.data[key], ' ')
		kv.mu.Unlock()
	}

	_, _, err := store.UpdatePoll("poll1", func(p *Poll) (bool, error) {
		return p.Vote("alice", 0, now)
	})
	require.Error(t, err)
	assert.False(t, errors.Is(err, errPollNotFound))
	assert.Equal(t, atomicUpdateAttempts, n)
}
