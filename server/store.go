// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

const (
	// pollKeyPrefix prefixes the key of every poll.
	pollKeyPrefix = "poll_"

	atomicUpdateAttempts = 10
)

var errPollNotFound = errors.New("poll not found")

// kvAPI is the part of the plugin API used to store data (implemented by plugin.API).
type kvAPI interface {
	KVGet(key string) ([]byte, *model.AppError)
	KVSetWithOptions(key string, value []byte, options model.PluginKVSetOptions) (bool, *model.AppError)
}

// Store keeps the polls, votes included, in the plugin's KV store: one key per poll, updated
// with compare-and-set so that concurrent votes, from any server of a cluster, are all kept.
type Store struct {
	kv kvAPI
}

func NewStore(kv kvAPI) *Store {
	return &Store{kv: kv}
}

func pollKey(pollID string) string {
	return pollKeyPrefix + pollID
}

// GetPoll returns a poll, or errPollNotFound.
func (s *Store) GetPoll(pollID string) (*Poll, error) {
	poll, _, err := s.getPoll(pollID)
	return poll, err
}

func (s *Store) getPoll(pollID string) (*Poll, []byte, error) {
	data, appErr := s.kv.KVGet(pollKey(pollID))
	if appErr != nil {
		return nil, nil, errors.Wrap(appErr, "failed to get poll")
	}
	if data == nil {
		return nil, nil, errPollNotFound
	}
	var poll Poll
	if err := json.Unmarshal(data, &poll); err != nil {
		return nil, nil, errors.Wrap(err, "failed to decode poll")
	}
	if poll.Votes == nil {
		poll.Votes = map[string][]int{}
	}
	return &poll, data, nil
}

// CreatePoll saves a new poll.
func (s *Store) CreatePoll(poll *Poll) error {
	data, err := json.Marshal(poll)
	if err != nil {
		return errors.Wrap(err, "failed to encode poll")
	}
	ok, appErr := s.kv.KVSetWithOptions(pollKey(poll.ID), data, model.PluginKVSetOptions{Atomic: true, OldValue: nil})
	if appErr != nil {
		return errors.Wrap(appErr, "failed to save poll")
	}
	if !ok {
		return errors.New("failed to save poll: the poll already exists")
	}
	return nil
}

// UpdatePoll applies change to the current poll and saves the result if change says it changed
// the poll, retrying on concurrent updates. It returns the poll as saved and whether it changed.
func (s *Store) UpdatePoll(pollID string, change func(poll *Poll) (bool, error)) (*Poll, bool, error) {
	for range atomicUpdateAttempts {
		poll, oldData, err := s.getPoll(pollID)
		if err != nil {
			return nil, false, err
		}

		changed, err := change(poll)
		if err != nil || !changed {
			return poll, false, err
		}

		newData, err := json.Marshal(poll)
		if err != nil {
			return nil, false, errors.Wrap(err, "failed to encode poll")
		}
		if bytes.Equal(newData, oldData) {
			return poll, false, nil
		}
		ok, appErr := s.kv.KVSetWithOptions(pollKey(pollID), newData, model.PluginKVSetOptions{Atomic: true, OldValue: oldData})
		if appErr != nil {
			return nil, false, errors.Wrap(appErr, "failed to save poll")
		}
		if ok {
			return poll, true, nil
		}
	}
	return nil, false, errors.New("failed to save poll: too many concurrent updates")
}

// DeletePoll forgets a poll.
func (s *Store) DeletePoll(pollID string) error {
	if _, appErr := s.kv.KVSetWithOptions(pollKey(pollID), nil, model.PluginKVSetOptions{}); appErr != nil {
		return errors.Wrap(appErr, "failed to delete poll")
	}
	return nil
}
