# Polls

An Antimatter plugin to ask a question in a conversation and let everyone vote, with live results.

## Development

```sh
make dist      # build the plugin bundle in dist/
make test      # run the server and webapp tests
make check-style
```

Set `MM_SERVICESETTINGS_ENABLEDEVELOPER=true` to only build the server for the current platform.

## License

GNU Affero General Public License v3.0, see [LICENSE.txt](LICENSE.txt). The build tooling is derived
from Apache-2.0 licensed Mattermost plugins, see [NOTICE.txt](NOTICE.txt).
