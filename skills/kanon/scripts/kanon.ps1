$kanonCli = Join-Path $PSScriptRoot '../../../runtime/cli.js'
& node $kanonCli @args
exit $LASTEXITCODE
