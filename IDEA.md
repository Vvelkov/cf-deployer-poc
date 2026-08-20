# Idea

## General

The purpose of this document is to describe the idea(s) behind the prototype that has to be built

## CF Deployer

The main idea is to build some web UI which demonstrates how AI agents can be deployed on Cloud Foundry landscape.

The goal to have this as a web UI is to make ot more flashy to present.

Here is breakdown of what the "CF Deployer" is expected to do:

### configuration

This is the last and least used tab. It will contain fields so that the "CF Deployer" can work with private container registry and Cloud Foundry landscape. This is why I imagine that it will have the following configuration properties:

* CF API URL
* CF API Username
* CF API Password
* Docker Username
* Docker Password

If some more configuration properties are needed, they will be added later.

### deployment

I imagine this tab is a list. The list lists "Deployments". Initially, it will be empty. There should be a "New" button, which opens a window to create a new deployment.

New deployment requires the end-user to provide the following:

* container image

This is the container image which includes the end-user application; it is hosted in a private container registry; the credentials for this container registry are found in the `configuration` section

* org + space

This is the org/space combination, where the Deployment will be deployed in the Cloud Foundry landscape.

* policy

This is openshell policy which will be used to "sandbox" the application. Here is an example of such a policy (actually, this will be the default one, it should be suggested to every new deployment and the user can edit it if needed):

```yaml
version: 1
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
```

* credentials

Now, this one is kind a tricky. In general it is a list of KEY=VALUE pairs. But, because those values are credentials, they contain sensitive information, which should not be directly visible. This is why I imagine that there would be some kind of "Upload" button, which is used by the user to upload a file, which contains that credentials in the form if KEY=VALUE.

Once the user uploads that file, the credentials should be displayed in some limited way, for example:

```
AI_CORE_SECRET=asd123.....
GITHUB_PAT=qwe123.....
```

Once the the user provides the information needed by the Deployment, it is created and processed asynchronously. The processing includes two main steps:

* sandboxify - to be further detailed below
* deploy to CF - to be further detailed below

I imagine that it will be effective if the progress on those two tasks is shown somehow on the UI.

### A2A client

The applications are AI agents. Once deployed, it would be usefull if they are tested from the same UI, so that they are requested on behalf of different tenants. To be further detailed below.

### CF Status

Last, but not least, the application that is deployed is reflected in Cloud Foundry landscape in terms of several applications. Moreover, as the application is tested (requests are sent), the number of those applications change (new ones are created, unused ones are stopped). So, it would also be usefull if the applications in the org/space in the Cloud Foundry landscape is shown and updated automatically.

## Technology

There are no constraints regarding the technologies used.

For the sake of simplicity, the Web UI could be implemented to run only locally, so that it does not have to deal with deployment and dependencies, etc.

Consider the current state of sandboxifying and deployment when deciding how to implement the web UI.

## Context

* sandboxify - in general, it is currently implemented by the @/Users/I072325/Documents/git/sandboxify/sandboxify.sh script; Overall, you can find more information about the sandboxifying as a concept in @/Users/I072325/Documents/git/sandboxify
* deployment - in general, it is currently implemented by the @/Users/I072325/Documents/git/sandbox-router-cf-poc/scripts/deploy-service-2.sh script; Overall, you can find more information about the deployment as a concept in @/Users/I072325/Documents/git/sandbox-router-cf-poc/scripts
* A2A client - currently, the deployed application is requested using the following script: @/Users/I072325/Documents/git/sandbox-router-cf-poc/scripts/test-request.sh

## Constraints

Ask if something is not clear enough
Do not assume

## Testing

To make the implementation easier, think of ways to test the implemented web UI easily and deterministically.
