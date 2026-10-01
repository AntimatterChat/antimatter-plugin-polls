// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"net/http"
	"sync"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// Plugin implements the interface expected by the Antimatter server to communicate between the
// server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex

	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	store  *Store
	router *mux.Router
	closer closeScheduler

	// now returns the current time in milliseconds; replaced in tests.
	now func() int64
}

// OnActivate is invoked when the plugin is activated.
func (p *Plugin) OnActivate() error {
	if p.now == nil {
		p.now = model.GetMillis
	}
	p.store = NewStore(p.API)
	p.router = p.newRouter()
	return p.startCloseScheduler()
}

// ServeHTTP serves the plugin's REST API.
func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}
