# Go

Go support for Lumen: syntax, snippets, `gopls`, Delve, project detection for
Go modules and a project template.

## Contents

- **Language** `.go`: backtick strings, channel operators (`<-`, `:=`, `&^`),
  capitalization as a type, 13 snippets from `iferr` to the table-driven test
- **Language server** `gopls` with `staticcheck`, `gofumpt` and suggestions from
  packages that are not yet imported
- **Debugger** Delve
- **Project kind** Go module (`go.mod`, `go.work`) with build, test and tidy
  tasks; `go get` adds dependencies
- **Template** module as a program (`cmd/`) or as a library

## Tools

```sh
go install golang.org/x/tools/gopls@latest
go install github.com/go-delve/delve/cmd/dlv@latest
```

If `gopls` is missing, Lumen offers to install it when a `.go` file is opened.
