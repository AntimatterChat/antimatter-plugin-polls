# Polls

An Antimatter plugin to ask a question in a conversation and let everyone vote, with live results.

## Features

- **Polls in any conversation.** A poll is a question with 2 to 10 answers, posted as a message of
  its creator in a channel, a direct or group message, or a thread.
- **Single or multiple choice.** Voters pick one answer, or several with *Allow multiple answers*.
  Clicking an answer again removes the vote.
- **Live results.** Every answer shows its share of the voters, a bar, and the faces of its first
  voters (all of them are named in its tooltip). Results update live for everyone.
- **Anonymous polls.** Nobody, the creator included, sees who voted for what; voters still see their
  own votes.
- **End time.** A poll can close by itself after 1 hour to 30 days. Its creator, the channel's admins
  and those who can delete others' posts in the channel can also close it by hand. Closed polls show
  their final results and take no votes.
- **Three ways to create a poll:**
  - the **+** menu of the message box: *Create a poll* (with servers that have the
    `registerComposerMenuItem` web app hook, see below; others get a channel header button);
  - `/poll` alone, which opens the poll creation dialog;
  - `/poll "Question" "Answer 1" "Answer 2" [--multi] [--anonymous] [--duration 1h]`, which posts the
    poll right away (durations: `30m`, `8h`, `3d`, `1w`, `1h30m`…; curly quotes work too).
    `/poll help` explains it.
- **Both web UIs.** In the classic web app, polls are drawn in its style and created with an
  interactive dialog. In the Fusion UI, polls and the creation dialog use the mockup's design.
- **Other clients.** Clients that can't show polls (e.g. the mobile apps) show the poll post's text:
  the question and answers, and the results once the poll is closed. `/poll` works from every client.

## Installation

Upload the plugin bundle in **System Console > Plugins > Plugin Management** and enable it, or enable
it in the server configuration (`PluginSettings.PluginStates["com.antimatterchat.polls"].Enable`).
The plugin has no settings.

See the [user guide](https://antimatter.chat/docs/users/apps.html#polls) for more.

## How it works

- A poll is a `poll_<poll id>` key in the plugin's KV store, holding its question, answers, options and
  every user's votes. Votes are saved with compare-and-set and retried, so concurrent votes on any
  server of a cluster are all kept.
- The poll is shown by a `custom_poll` post of its creator whose `poll_id` prop names it. The plugin
  rejects poll posts it didn't create, keeps the type and poll of a poll post when it's edited, and
  deletes the poll when its post is deleted.
- Polls with an end time take no votes from then on. A job of the plugin API's cluster job scheduler
  also closes them at that time (on one server of the cluster, and on start for the ones missed while
  the plugin was off) so that the channel is told and the post's text shows the results.

REST API, under `/plugins/com.antimatterchat.polls/api/v1` (user session required). Polls are only
visible to those who can read their channel, others get `404`:

| Request | Body | Response |
|---|---|---|
| `POST /polls` | `{"channel_id", "root_id"?, "question", "options": [..], "multi", "anonymous", "duration_minutes"}` | `201` and the poll. Needs the permission to post in the channel. |
| `GET /polls/{poll_id}` | | the poll |
| `POST /polls/{poll_id}/vote` | `{"option": <answer index>}` | the poll. `409` when the poll is closed. |
| `POST /polls/{poll_id}/unvote` | `{"option": <answer index>}` | the poll |
| `POST /polls/{poll_id}/close` | | the poll. For its creator, the channel's admins and those who can delete others' posts in the channel. |
| `POST /dialog` | an interactive dialog submission | creates the poll of the server's poll creation dialog |

A poll is `{"id", "post_id", "channel_id", "creator_id", "question", "options": [{"text", "votes",
"voters"}], "multi", "anonymous", "create_at", "end_at", "closed_at", "closed", "voter_count",
"my_votes"}`: `voters` (user IDs) is left out of anonymous polls, `my_votes` lists the answers the
requesting user voted for.

WebSocket events: `custom_com.antimatterchat.polls_poll_updated` (`{"poll": "<poll JSON>"}`, with no
`my_votes`) to the channel's members on every vote and when a poll closes, and
`custom_com.antimatterchat.polls_poll_my_votes` (`{"poll_id", "my_votes": "<JSON array>"}`) to the
voter's sessions.

## Web app hooks

The plugin uses the Antimatter web app hook `registerComposerMenuItem` (both web UIs) to add *Create a
poll* to the message box's **+** menu, and falls back to a channel header button without it. Under the
Fusion UI (`window.antimatterWebUI === 'fusion'`), it draws polls with the mockup's `am-` classes and
its own creation dialog in the UI's layer, and opens that dialog for `/poll` alone.

## Development

```sh
make dist      # build the plugin bundle in dist/
make test      # run the server and webapp tests
make check-style
```

Set `MM_SERVICESETTINGS_ENABLEDEVELOPER=true` to only build the server for the current platform.

## Releases

Pushing a `v*` tag builds the app and publishes it as a
[GitHub release](https://github.com/AntimatterChat/antimatter-plugin-polls/releases) ([release workflow](.github/workflows/release.yml),
using the organisation's shared
[app release workflow](https://github.com/AntimatterChat/.github/blob/main/.github/workflows/app-release.yml)).
The version is the tag without its `v`. Tags with a `-`, such as `v1.2.0-rc.1`, are published as prereleases. Each release has:

- `com.antimatterchat.polls-<version>.tar.gz`: the app bundle, with the server for Linux (amd64, arm64), macOS (amd64, arm64) and Windows (amd64)
- `com.antimatterchat.polls-<version>.tar.gz.sig`: its detached signature with the Antimatter plugin signing key
- `SHA256SUMS`: the checksums of the release files

Install the bundle with **Upload Plugin** in **System Console > Plugins > Plugin Management** or
`amctl plugin install-url <bundle URL>` (both need `AM_PLUGINSETTINGS_ENABLEUPLOADS=true`), see
[Installing other apps](https://antimatter.chat/docs/admins/apps.html). A release without `.sig`
files is unsigned (its notes say so): a server with Require Plugin Signature
(`PluginSettings.RequirePluginSignature`) on refuses it. Running the workflow by hand (*Actions* → *Release* → *Run workflow*)
builds the bundle as a workflow artifact, and as a draft prerelease if you tick the box; builds
of untagged commits are versioned after the latest tag and the commit.

## Feedback and support

Found a bug in the Polls plugin, or missing a feature? Please [open an
issue](https://github.com/AntimatterChat/community/issues/new/choose) in the [Antimatter community
repository](https://github.com/AntimatterChat/community), where the feedback for every part of
Antimatter is gathered. Questions and ideas are welcome in its
[Discussions](https://github.com/AntimatterChat/community/discussions). Please report security
problems privately, as explained in the [security
policy](https://github.com/AntimatterChat/.github/blob/main/SECURITY.md).

## License

GNU Affero General Public License v3.0, see [LICENSE.txt](LICENSE.txt). The build tooling is derived
from Apache-2.0 licensed Mattermost plugins, see [NOTICE.txt](NOTICE.txt).
