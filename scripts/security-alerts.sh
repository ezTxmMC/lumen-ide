{
  echo '{"dependabot": ' && \
  gh api repos/ezTxmMC/lumen-ide/dependabot/alerts --paginate \
    --jq '[.[] | select(.state == "open") | {pkg: .dependency.package.name, severity: .security_advisory.severity}]' && \
  echo ', "codeql": ' && \
  gh api repos/ezTxmMC/lumen-ide/code-scanning/alerts --paginate \
    --jq '[.[] | select(.state == "open") | {rule: .rule.id, severity: .rule.severity}]' && \
  echo '}'
} > ../security-alerts.json
