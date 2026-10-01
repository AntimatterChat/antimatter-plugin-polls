// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"
	"github.com/pkg/errors"
)

// closeJobKeyPrefix prefixes the key of the job that closes a poll at its end time.
const closeJobKeyPrefix = "close_poll_"

// closeScheduler runs jobs once, at a given time, on one server of the cluster, even across
// restarts (implemented by cluster.JobOnceScheduler).
type closeScheduler interface {
	ScheduleOnce(key string, runAt time.Time, props any) (*cluster.JobOnce, error)
	Cancel(key string)
}

// startCloseScheduler starts closing the polls that reach their end time, including the ones that
// reached it while the plugin was off.
func (p *Plugin) startCloseScheduler() error {
	scheduler := cluster.GetJobOnceScheduler(p.API)
	if err := scheduler.SetCallback(p.runCloseJob); err != nil {
		return errors.Wrap(err, "failed to set the callback of the poll close jobs")
	}
	if err := scheduler.Start(); err != nil {
		return errors.Wrap(err, "failed to start the poll close jobs")
	}
	p.closer = scheduler
	return nil
}

// scheduleClose makes the poll close at its end time. Polls are also shown as closed, and take no
// votes, from their end time on even if the job runs late.
func (p *Plugin) scheduleClose(poll *Poll) {
	if poll.EndAt == 0 || p.closer == nil {
		return
	}
	if _, err := p.closer.ScheduleOnce(closeJobKeyPrefix+poll.ID, time.UnixMilli(poll.EndAt), nil); err != nil {
		p.API.LogError("Failed to schedule the closing of a poll", "poll_id", poll.ID, "err", err.Error())
	}
}

// cancelClose forgets the job closing the poll at its end time, once it's closed before.
func (p *Plugin) cancelClose(poll *Poll) {
	if poll.EndAt == 0 || p.closer == nil {
		return
	}
	p.closer.Cancel(closeJobKeyPrefix + poll.ID)
}

func (p *Plugin) runCloseJob(key string, _ any) {
	pollID, ok := strings.CutPrefix(key, closeJobKeyPrefix)
	if !ok {
		return
	}
	if _, err := p.closePoll(pollID); err != nil && !errors.Is(err, errPollNotFound) {
		p.API.LogError("Failed to close a poll at its end time", "poll_id", pollID, "err", err.Error())
	}
}
