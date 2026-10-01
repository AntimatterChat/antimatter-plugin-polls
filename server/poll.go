// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

const (
	MinOptions        = 2
	MaxOptions        = 10
	MaxQuestionLength = 200
	MaxOptionLength   = 80

	// MaxDurationMinutes is the longest a poll can stay open: 30 days.
	MaxDurationMinutes = 30 * 24 * 60
)

var (
	errPollClosed    = errors.New("the poll is closed")
	errInvalidOption = errors.New("no such answer")
)

// Poll is a question that the members of a channel answer by voting for one or more of its answers.
type Poll struct {
	ID        string `json:"id"`
	PostID    string `json:"post_id"`
	ChannelID string `json:"channel_id"`
	CreatorID string `json:"creator_id"`

	Question string   `json:"question"`
	Options  []string `json:"options"`

	// Multi lets voters pick more than one answer.
	Multi bool `json:"multi"`

	// Anonymous hides who voted for what, from everyone.
	Anonymous bool `json:"anonymous"`

	CreateAt int64 `json:"create_at"`

	// EndAt is when the poll closes by itself, 0 for never.
	EndAt int64 `json:"end_at,omitempty"`

	// ClosedAt is when the poll was closed, 0 while it's open.
	ClosedAt int64 `json:"closed_at,omitempty"`

	// Votes are the answers (indexes in Options, sorted) each user voted for, by user ID.
	Votes map[string][]int `json:"votes"`
}

// PollRequest is what a poll is made of when created.
type PollRequest struct {
	Question  string   `json:"question"`
	Options   []string `json:"options"`
	Multi     bool     `json:"multi"`
	Anonymous bool     `json:"anonymous"`

	// DurationMinutes is how long the poll stays open, 0 for no end.
	DurationMinutes int `json:"duration_minutes"`
}

// Normalize trims the request's texts and drops the empty answers.
func (r *PollRequest) Normalize() {
	r.Question = strings.TrimSpace(r.Question)
	options := make([]string, 0, len(r.Options))
	for _, option := range r.Options {
		if option = strings.TrimSpace(option); option != "" {
			options = append(options, option)
		}
	}
	r.Options = options
}

// Validate returns why the (normalized) request can't make a poll, or nil.
func (r *PollRequest) Validate() error {
	if r.Question == "" {
		return errors.New("the question is empty")
	}
	if utf8.RuneCountInString(r.Question) > MaxQuestionLength {
		return fmt.Errorf("the question is longer than %d characters", MaxQuestionLength)
	}
	if len(r.Options) < MinOptions {
		return fmt.Errorf("a poll needs at least %d answers", MinOptions)
	}
	if len(r.Options) > MaxOptions {
		return fmt.Errorf("a poll can have up to %d answers", MaxOptions)
	}
	seen := make(map[string]bool, len(r.Options))
	for _, option := range r.Options {
		if utf8.RuneCountInString(option) > MaxOptionLength {
			return fmt.Errorf("the answer %q is longer than %d characters", option, MaxOptionLength)
		}
		key := strings.ToLower(option)
		if seen[key] {
			return fmt.Errorf("the answer %q is given twice", option)
		}
		seen[key] = true
	}
	if r.DurationMinutes < 0 || r.DurationMinutes > MaxDurationMinutes {
		return fmt.Errorf("a poll can last up to %d days", MaxDurationMinutes/(24*60))
	}
	return nil
}

// NewPoll makes an open poll from a valid request.
func NewPoll(id, channelID, creatorID string, req *PollRequest, now int64) *Poll {
	poll := &Poll{
		ID:        id,
		ChannelID: channelID,
		CreatorID: creatorID,
		Question:  req.Question,
		Options:   slices.Clone(req.Options),
		Multi:     req.Multi,
		Anonymous: req.Anonymous,
		CreateAt:  now,
		Votes:     map[string][]int{},
	}
	if req.DurationMinutes > 0 {
		poll.EndAt = now + int64(req.DurationMinutes)*60*1000
	}
	return poll
}

// IsClosed returns whether the poll was closed or has reached its end.
func (p *Poll) IsClosed(now int64) bool {
	return p.ClosedAt != 0 || (p.EndAt != 0 && now >= p.EndAt)
}

// Vote adds the user's vote for an answer. In single choice polls it replaces the user's previous
// vote. It returns whether the votes changed.
func (p *Poll) Vote(userID string, option int, now int64) (bool, error) {
	if err := p.checkVote(option, now); err != nil {
		return false, err
	}
	mine := p.Votes[userID]
	if slices.Contains(mine, option) && (p.Multi || len(mine) == 1) {
		return false, nil
	}
	if p.Multi {
		mine = append(slices.Clone(mine), option)
		slices.Sort(mine)
	} else {
		mine = []int{option}
	}
	if p.Votes == nil {
		p.Votes = map[string][]int{}
	}
	p.Votes[userID] = mine
	return true, nil
}

// Unvote removes the user's vote for an answer. It returns whether the votes changed.
func (p *Poll) Unvote(userID string, option int, now int64) (bool, error) {
	if err := p.checkVote(option, now); err != nil {
		return false, err
	}
	mine := p.Votes[userID]
	i := slices.Index(mine, option)
	if i < 0 {
		return false, nil
	}
	mine = slices.Delete(slices.Clone(mine), i, i+1)
	if len(mine) == 0 {
		delete(p.Votes, userID)
	} else {
		p.Votes[userID] = mine
	}
	return true, nil
}

func (p *Poll) checkVote(option int, now int64) error {
	if p.IsClosed(now) {
		return errPollClosed
	}
	if option < 0 || option >= len(p.Options) {
		return errInvalidOption
	}
	return nil
}

// Close closes the poll for good. It returns false if it was already closed. A poll that reached
// its end closes at its end time.
func (p *Poll) Close(now int64) bool {
	if p.ClosedAt != 0 {
		return false
	}
	p.ClosedAt = now
	if p.EndAt != 0 && p.EndAt < now {
		p.ClosedAt = p.EndAt
	}
	return true
}

// OptionView is an answer of a poll with its votes.
type OptionView struct {
	Text  string `json:"text"`
	Votes int    `json:"votes"`

	// Voters are the IDs of the users who voted for the answer, in no particular order. Anonymous
	// polls don't tell.
	Voters []string `json:"voters,omitempty"`
}

// PollView is a poll as shown to users.
type PollView struct {
	ID        string       `json:"id"`
	PostID    string       `json:"post_id"`
	ChannelID string       `json:"channel_id"`
	CreatorID string       `json:"creator_id"`
	Question  string       `json:"question"`
	Options   []OptionView `json:"options"`
	Multi     bool         `json:"multi"`
	Anonymous bool         `json:"anonymous"`
	CreateAt  int64        `json:"create_at"`
	EndAt     int64        `json:"end_at,omitempty"`
	ClosedAt  int64        `json:"closed_at,omitempty"`
	Closed    bool         `json:"closed"`

	// VoterCount is the number of people who voted.
	VoterCount int `json:"voter_count"`

	// MyVotes are the answers the user who asked voted for. Views sent to everyone leave them out.
	MyVotes []int `json:"my_votes"`
}

// View returns the poll as shown to a user, or to everyone when userID is empty.
func (p *Poll) View(userID string, now int64) *PollView {
	view := &PollView{
		ID:         p.ID,
		PostID:     p.PostID,
		ChannelID:  p.ChannelID,
		CreatorID:  p.CreatorID,
		Question:   p.Question,
		Options:    make([]OptionView, len(p.Options)),
		Multi:      p.Multi,
		Anonymous:  p.Anonymous,
		CreateAt:   p.CreateAt,
		EndAt:      p.EndAt,
		ClosedAt:   p.ClosedAt,
		Closed:     p.IsClosed(now),
		VoterCount: len(p.Votes),
	}
	if view.Closed && view.ClosedAt == 0 {
		view.ClosedAt = p.EndAt
	}
	for i, text := range p.Options {
		view.Options[i].Text = text
	}

	voters := make([]string, 0, len(p.Votes))
	for voter := range p.Votes {
		voters = append(voters, voter)
	}
	slices.Sort(voters)
	for _, voter := range voters {
		for _, option := range p.Votes[voter] {
			if option < 0 || option >= len(view.Options) {
				continue
			}
			view.Options[option].Votes++
			if !p.Anonymous {
				view.Options[option].Voters = append(view.Options[option].Voters, voter)
			}
		}
	}

	if userID != "" {
		view.MyVotes = slices.Clone(p.Votes[userID])
	}
	if view.MyVotes == nil {
		view.MyVotes = []int{}
	}
	return view
}

// Percent returns the share of the voters who voted for an answer, rounded.
func (v *PollView) Percent(option int) int {
	if v.VoterCount == 0 || option < 0 || option >= len(v.Options) {
		return 0
	}
	return (v.Options[option].Votes*100 + v.VoterCount/2) / v.VoterCount
}

// FallbackMessage is the text of a poll's post, shown by the clients that can't show polls (e.g.
// the mobile apps) and used by notifications and search.
func (v *PollView) FallbackMessage() string {
	var b strings.Builder
	if v.Closed {
		b.WriteString("**Poll (closed):** ")
	} else {
		b.WriteString("**Poll:** ")
	}
	b.WriteString(v.Question)
	for i, option := range v.Options {
		fmt.Fprintf(&b, "\n%d. %s", i+1, option.Text)
		if v.Closed {
			fmt.Fprintf(&b, " — %d %s (%d%%)", option.Votes, plural(option.Votes, "vote", "votes"), v.Percent(i))
		}
	}
	return b.String()
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
