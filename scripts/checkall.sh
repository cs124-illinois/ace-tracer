#!/usr/bin/env bash
rush update && \
  rush rebuild && \
  pushd types && rushx check && popd && \
  pushd lib && rushx check && popd && \
  pushd demo && rushx check && popd
#vim: tw=0
