# GDS-Template-Site

## Build portal with docker

```sh
docker build --security-opt seccomp=unconfined -t policy/portal:latest .
```

## Writing your own authorization implementation

To implement authorization create a file called `portal/libs/middleware/authorizationImpl.js`.

See the [example implementation](./portal/libs/middleware/authorizationImpl.js.example) for more details.
