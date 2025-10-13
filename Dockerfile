FROM node:lts-alpine as build
WORKDIR /build
COPY ./portal /build
ENV NODE_EXTRA_CA_CERTS=/build/ca-bundle.crt
RUN npm install --ignore-scripts

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY configs configs
COPY --from=build /build portal
EXPOSE 3000
CMD ["/app/portal/app.js"]
