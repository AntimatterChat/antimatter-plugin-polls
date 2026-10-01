// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/pkg/errors"
)

const (
	pluginID = "com.antimatterchat.polls"

	commandTrigger = "poll"
	commandUsage   = `/poll "Question" "Answer 1" "Answer 2" [--multi] [--anonymous] [--duration 1h]`

	dialogCallbackID = "create_poll"
)

// pollCommand is the /poll slash command, which works from every client.
func pollCommand() *model.Command {
	data := model.NewAutocompleteData(commandTrigger, `"Question" "Answer 1" "Answer 2" [--multi] [--anonymous] [--duration 1h]`,
		"Create a poll. Without arguments, opens the poll creation dialog.")
	data.AddTextArgument(`The question and 2 to 10 answers, each in quotes, then options: --multi to allow several answers, --anonymous to hide who voted, --duration (30m, 8h, 3d, 1w) to close it automatically`,
		`"Question" "Answer 1" "Answer 2"`, "")
	return &model.Command{
		Trigger:          commandTrigger,
		DisplayName:      "Polls",
		Description:      "Create a poll",
		AutoComplete:     true,
		AutoCompleteDesc: "Create a poll. Without arguments, opens the poll creation dialog.",
		AutoCompleteHint: `"Question" "Answer 1" "Answer 2" [--multi] [--anonymous] [--duration 1h]`,
		AutocompleteData: data,
	}
}

// ExecuteCommand runs /poll.
func (p *Plugin) ExecuteCommand(_ *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	rest := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(args.Command), "/"+commandTrigger))
	if rest == "" {
		if err := p.openCreateDialog(args); err != nil {
			p.API.LogWarn("Failed to open the poll dialog", "err", err.Error())
			return ephemeral("Usage: `" + commandUsage + "`"), nil
		}
		return &model.CommandResponse{}, nil
	}
	if rest == "help" {
		return ephemeral(commandHelp()), nil
	}

	req, err := parsePollCommand(rest)
	if err != nil {
		return ephemeral(err.Error() + "\nUsage: `" + commandUsage + "`"), nil
	}
	if _, err := p.createPoll(args.UserId, args.ChannelId, args.RootId, req); err != nil {
		if statusFor(err) >= http.StatusInternalServerError {
			p.API.LogError("Failed to create a poll", "err", err.Error())
			return ephemeral("The poll couldn't be created, please try again."), nil
		}
		return ephemeral("The poll couldn't be created: " + err.Error() + "."), nil
	}
	return &model.CommandResponse{}, nil
}

func ephemeral(text string) *model.CommandResponse {
	return &model.CommandResponse{ResponseType: model.CommandResponseTypeEphemeral, Text: text}
}

func commandHelp() string {
	return "Create a poll in the conversation:\n" +
		"- `/poll` opens the poll creation dialog.\n" +
		"- `" + commandUsage + "` posts a poll right away. Put the question and every answer (2 to 10) in quotes.\n" +
		"  - `--multi` lets voters pick more than one answer.\n" +
		"  - `--anonymous` hides who voted for what, from everyone.\n" +
		"  - `--duration` closes the poll automatically after a time such as `30m`, `8h`, `3d` or `1w` (up to 30 days)."
}

// parsePollCommand reads the arguments of /poll: the quoted question and answers, and the options.
func parsePollCommand(args string) (*PollRequest, error) {
	tokens, err := splitArgs(args)
	if err != nil {
		return nil, err
	}

	req := &PollRequest{}
	var texts []string
	for i := 0; i < len(tokens); i++ {
		token := tokens[i]
		if !token.quoted && strings.HasPrefix(token.text, "--") {
			name, value, hasValue := strings.Cut(strings.TrimPrefix(token.text, "--"), "=")
			switch name {
			case "multi":
				req.Multi = true
			case "anonymous":
				req.Anonymous = true
			case "duration":
				if !hasValue {
					if i+1 >= len(tokens) {
						return nil, errors.New("--duration needs a duration, such as 1h")
					}
					i++
					value = tokens[i].text
				}
				minutes, err := parseDuration(value)
				if err != nil {
					return nil, err
				}
				req.DurationMinutes = minutes
			default:
				return nil, fmt.Errorf("unknown option --%s", name)
			}
			continue
		}
		texts = append(texts, token.text)
	}

	if len(texts) == 0 {
		return nil, errors.New("the question is missing")
	}
	req.Question = texts[0]
	req.Options = texts[1:]
	req.Normalize()
	if err := req.Validate(); err != nil {
		return nil, err
	}
	return req, nil
}

type argToken struct {
	text   string
	quoted bool
}

var closingQuote = map[rune]rune{'"': '"', '“': '”', '„': '“', '«': '»'}

// splitArgs splits the arguments of a command on spaces, keeping quoted texts (straight or curly
// quotes, as typed on phones and macOS) together.
func splitArgs(s string) ([]argToken, error) {
	var tokens []argToken
	runes := []rune(s)
	for i := 0; i < len(runes); {
		r := runes[i]
		if unicode.IsSpace(r) {
			i++
			continue
		}
		if closing, ok := closingQuote[r]; ok {
			end := i + 1
			for end < len(runes) && runes[end] != closing && !(r == '"' && runes[end] == '”') {
				end++
			}
			if end >= len(runes) {
				return nil, errors.New("a quote isn't closed")
			}
			tokens = append(tokens, argToken{text: string(runes[i+1 : end]), quoted: true})
			i = end + 1
			continue
		}
		end := i
		for end < len(runes) && !unicode.IsSpace(runes[end]) {
			end++
		}
		tokens = append(tokens, argToken{text: string(runes[i:end])})
		i = end
	}
	return tokens, nil
}

var durationPart = regexp.MustCompile(`(\d+)(min|m|h|d|w)`)

// parseDuration reads a duration such as 30m, 8h, 3d, 1w or 1h30m, in minutes.
func parseDuration(s string) (int, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	invalid := fmt.Errorf("invalid duration %q, use for example 30m, 8h, 3d or 1w", s)
	matches := durationPart.FindAllStringSubmatchIndex(s, -1)
	if len(matches) == 0 {
		return 0, invalid
	}
	minutes := 0
	pos := 0
	for _, m := range matches {
		if m[0] != pos {
			return 0, invalid
		}
		pos = m[1]
		n, err := strconv.Atoi(s[m[2]:m[3]])
		if err != nil || n > MaxDurationMinutes {
			return 0, invalid
		}
		switch s[m[4]:m[5]] {
		case "m", "min":
			minutes += n
		case "h":
			minutes += n * 60
		case "d":
			minutes += n * 24 * 60
		case "w":
			minutes += n * 7 * 24 * 60
		}
	}
	if pos != len(s) || minutes == 0 {
		return 0, invalid
	}
	if minutes > MaxDurationMinutes {
		return 0, fmt.Errorf("a poll can last up to %d days", MaxDurationMinutes/(24*60))
	}
	return minutes, nil
}

// openCreateDialog opens the poll creation dialog, for the clients without the plugin's own.
func (p *Plugin) openCreateDialog(args *model.CommandArgs) error {
	if args.TriggerId == "" {
		return errors.New("no trigger ID")
	}
	appErr := p.API.OpenInteractiveDialog(model.OpenDialogRequest{
		TriggerId: args.TriggerId,
		URL:       "/plugins/" + pluginID + "/api/v1/dialog",
		Dialog: model.Dialog{
			CallbackId:       dialogCallbackID,
			Title:            "Create a poll",
			IntroductionText: "Everyone in the conversation can vote. Results update live.",
			Elements: []model.DialogElement{
				{DisplayName: "Question", Name: "question", Type: "text", MaxLength: MaxQuestionLength, Placeholder: "What should we decide?"},
				{
					DisplayName: "Answers", Name: "options", Type: "textarea", MaxLength: MaxOptions * (MaxOptionLength + 1),
					HelpText: fmt.Sprintf("One answer per line, %d to %d answers.", MinOptions, MaxOptions),
				},
				{DisplayName: "Allow multiple answers", Name: "multi", Type: "bool", Optional: true, Placeholder: "Voters can pick more than one answer."},
				{DisplayName: "Anonymous", Name: "anonymous", Type: "bool", Optional: true, Placeholder: "Nobody sees who voted for what."},
				{
					DisplayName: "Duration", Name: "duration", Type: "select", Default: "1440",
					Options: []*model.PostActionOptions{
						{Text: "1 hour", Value: "60"},
						{Text: "8 hours", Value: "480"},
						{Text: "1 day", Value: "1440"},
						{Text: "3 days", Value: "4320"},
						{Text: "1 week", Value: "10080"},
						{Text: "No end", Value: "0"},
					},
				},
			},
			SubmitLabel: "Post poll",
			State:       args.RootId,
		},
	})
	if appErr != nil {
		return appErr
	}
	return nil
}

// handleDialog creates the poll submitted with the creation dialog.
func (p *Plugin) handleDialog(w http.ResponseWriter, r *http.Request) {
	var submit model.SubmitDialogRequest
	if err := readJSON(w, r, &submit); err != nil || submit.CallbackId != dialogCallbackID {
		p.writeError(w, newAPIError(http.StatusBadRequest, "invalid dialog submission"))
		return
	}
	if submit.Cancelled {
		w.WriteHeader(http.StatusOK)
		return
	}

	text := func(name string) string {
		v, _ := submit.Submission[name].(string)
		return v
	}
	flag := func(name string) bool {
		switch v := submit.Submission[name].(type) {
		case bool:
			return v
		case string:
			return v == "true"
		}
		return false
	}
	req := &PollRequest{
		Question:  text("question"),
		Options:   strings.Split(text("options"), "\n"),
		Multi:     flag("multi"),
		Anonymous: flag("anonymous"),
	}
	if duration := text("duration"); duration != "" {
		minutes, err := strconv.Atoi(duration)
		if err != nil {
			p.writeJSON(w, http.StatusOK, model.SubmitDialogResponse{Errors: map[string]string{"duration": "Pick a duration."}})
			return
		}
		req.DurationMinutes = minutes
	}

	req.Normalize()
	if err := req.Validate(); err != nil {
		field := "options"
		if req.Question == "" || strings.Contains(err.Error(), "question") {
			field = "question"
		}
		p.writeJSON(w, http.StatusOK, model.SubmitDialogResponse{Errors: map[string]string{field: capitalize(err.Error()) + "."}})
		return
	}

	userID := r.Header.Get("Mattermost-User-Id")
	if _, err := p.createPoll(userID, submit.ChannelId, submit.State, req); err != nil {
		if statusFor(err) >= http.StatusInternalServerError {
			p.API.LogError("Failed to create a poll", "err", err.Error())
			p.writeJSON(w, http.StatusOK, model.SubmitDialogResponse{Error: "The poll couldn't be created, please try again."})
			return
		}
		p.writeJSON(w, http.StatusOK, model.SubmitDialogResponse{Error: capitalize(err.Error()) + "."})
		return
	}
	w.WriteHeader(http.StatusOK)
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}
