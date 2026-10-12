// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

const requestBodyMaxSizeBytes = 64 * 1024

// newRouter returns the router of the plugin's REST API, served under
// /plugins/com.antimatterchat.polls/api/v1.
func (p *Plugin) newRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.requireUser)

	api := router.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/polls", p.handleCreatePoll).Methods(http.MethodPost)
	api.HandleFunc("/polls/{poll_id:[a-z0-9]{26}}", p.handleGetPoll).Methods(http.MethodGet)
	api.HandleFunc("/polls/{poll_id:[a-z0-9]{26}}/vote", p.handleVote(true)).Methods(http.MethodPost)
	api.HandleFunc("/polls/{poll_id:[a-z0-9]{26}}/unvote", p.handleVote(false)).Methods(http.MethodPost)
	api.HandleFunc("/polls/{poll_id:[a-z0-9]{26}}/close", p.handleClosePoll).Methods(http.MethodPost)
	api.HandleFunc("/dialog", p.handleDialog).Methods(http.MethodPost)

	return router
}

func (p *Plugin) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-Id") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (p *Plugin) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		p.API.LogWarn("Failed to write response", "err", err.Error())
	}
}

func (p *Plugin) writeError(w http.ResponseWriter, err error) {
	status := statusFor(err)
	message := err.Error()
	if status >= http.StatusInternalServerError {
		// The details of internal errors go to the log, not to the user
		p.API.LogError("Polls request failed", "err", message)
		message = "internal error, please try again"
	}
	p.writeJSON(w, status, map[string]string{"error": message})
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) error {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(v); err != nil {
		return newAPIError(http.StatusBadRequest, "invalid request body")
	}
	return nil
}

func (p *Plugin) handleCreatePoll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PollRequest
		ChannelID string `json:"channel_id"`
		RootID    string `json:"root_id"`
	}
	if err := readJSON(w, r, &body); err != nil {
		p.writeError(w, err)
		return
	}

	userID := r.Header.Get("Mattermost-User-Id")
	poll, err := p.createPoll(userID, body.ChannelID, body.RootID, &body.PollRequest)
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusCreated, poll.View(userID, p.now()))
}

func (p *Plugin) handleGetPoll(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	poll, err := p.readablePoll(userID, mux.Vars(r)["poll_id"])
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusOK, poll.View(userID, p.now()))
}

func (p *Plugin) handleVote(add bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Option *int `json:"option"`
		}
		if err := readJSON(w, r, &body); err != nil || body.Option == nil {
			p.writeError(w, newAPIError(http.StatusBadRequest, `invalid request body, expected {"option": <answer index>}`))
			return
		}

		view, err := p.vote(r.Header.Get("Mattermost-User-Id"), mux.Vars(r)["poll_id"], *body.Option, add)
		if err != nil {
			p.writeError(w, err)
			return
		}
		p.writeJSON(w, http.StatusOK, view)
	}
}

func (p *Plugin) handleClosePoll(w http.ResponseWriter, r *http.Request) {
	view, err := p.closePollAsUser(r.Header.Get("Mattermost-User-Id"), mux.Vars(r)["poll_id"])
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusOK, view)
}
