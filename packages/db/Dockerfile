# Keep PostgreSQL, libc and collation libraries identical to the existing data volume.
FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873 AS build

# pgvector v0.8.7, commit f37c13f68b57d2c3472b2214fbcff699d6d34876.
# No CPU-native flags: the result must run on other machines of this architecture.
RUN apk add --no-cache build-base curl \
    && curl --fail --location --retry 3 \
       https://codeload.github.com/pgvector/pgvector/tar.gz/refs/tags/v0.8.7 \
       --output /tmp/pgvector.tar.gz \
    && echo 'cac0b10c360f05b2d521200105ba3697e773d4cd3731f5a915a7e37ebe0bea85  /tmp/pgvector.tar.gz' | sha256sum -c - \
    && mkdir /tmp/pgvector \
    && tar -xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components=1 \
    && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
    && make -C /tmp/pgvector with_llvm=no DESTDIR=/extension install

FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
COPY --from=build /extension/ /
