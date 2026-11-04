# Self-hosted runner image for the "e2e" job: the official ARC runner + Playwright's Chromium and its
# system libraries, installed at BUILD time so the running pod still needs no root / sudo.
#
# Build and load into kind (the office CA is passed in from outside, never stored in the repo):
#   docker build -t arc-runner-e2e:2.338.2-pw1.64.1 \
#     --build-context certs=<folder containing mwg-ca.crt> dummy/k8s/runner-e2e
#   kind load docker-image arc-runner-e2e:2.338.2-pw1.64.1 --name claude-demo
#
# Keep PLAYWRIGHT_VERSION equal to @playwright/test in frontend/package.json.
FROM ghcr.io/actions/actions-runner:2.338.2

ARG PLAYWRIGHT_VERSION=1.64.1
USER root

# office proxy (MWG) re-signs HTTPS: trust it for apt / npm / the browser download during the build
COPY --from=certs mwg-ca.crt /usr/local/share/ca-certificates/mwg-ca.crt
RUN update-ca-certificates

# apt over https (a plain-http download came back corrupted through the proxy: "Hash Sum mismatch")
RUN sed -i 's#http://\([a-z]*\)\.ubuntu\.com#https://\1.ubuntu.com#g' /etc/apt/sources.list.d/ubuntu.sources \
 && grep -q 'URIs: https://ports.ubuntu.com' /etc/apt/sources.list.d/ubuntu.sources \
 && \
    echo 'Acquire::Retries "3";' > /etc/apt/apt.conf.d/80-retries

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN NODE_BIN="$(ls -d /home/runner/externals/node*/bin | sort -V | tail -1)" \
 && export PATH="$NODE_BIN:$PATH" NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/mwg-ca.crt \
 && npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm \
 && chmod -R a+rX /ms-playwright

USER runner
