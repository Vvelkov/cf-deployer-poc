// The default OpenShell sandbox policy suggested for every new deployment.
// Copied verbatim from IDEA.md; the user may edit it per deployment.
export const DEFAULT_POLICY_YAML = `version: 1
filesystem_policy:
  include_workdir: true
  read_only: [/lib, /lib64, /bin, /sbin, /proc, /dev/urandom, /var/log]
  read_write: [/sandbox, /dev/null, /out, /data]
landlock:
  compatibility: hard
process:
  run_as_user: sandbox
  run_as_group: sandbox
network_policies:
  allow_github:
    name: allow-github
    endpoints:
      - { host: api.github.com, port: 443, protocol: rest, access: read-write, enforcement: enforce }
      - { host: github.tools.sap, port: 443, protocol: rest, access: read-write, enforcement: enforce }
    binaries:
      - { path: /usr/bin/python }
      - { path: /usr/bin/python3 }
      - { path: /usr/bin/python3.13 }
      - { path: /usr/local/bin/python3 }
      - { path: /usr/local/bin/python3.12 }
      - { path: /usr/local/bin/python3.13 }
      - { path: /usr/local/bin/gunicorn }
  allow_aicore:
    name: allow-aicore
    endpoints:
      - { host: api.ai.internalprod.eu-central-1.aws.ml.hana.ondemand.com, port: 443, tls: skip, enforcement: enforce }
    binaries:
      - { path: /usr/bin/python }
      - { path: /usr/bin/python3 }
      - { path: /usr/bin/python3.13 }
      - { path: /usr/local/bin/python3 }
      - { path: /usr/local/bin/python3.12 }
      - { path: /usr/local/bin/python3.13 }
      - { path: /usr/local/bin/gunicorn }
  allow_oauth:
    name: allow-oauth
    endpoints:
      - { host: app-fnd-on-cf-vipo5ge7.authentication.sap.hana.ondemand.com, port: 443, protocol: rest, access: read-write, enforcement: enforce, request_body_credential_rewrite: true }
    binaries:
      - { path: /usr/bin/python }
      - { path: /usr/bin/python3 }
      - { path: /usr/bin/python3.13 }
      - { path: /usr/local/bin/python3 }
      - { path: /usr/local/bin/python3.12 }
      - { path: /usr/local/bin/python3.13 }
      - { path: /usr/local/bin/gunicorn }
`
