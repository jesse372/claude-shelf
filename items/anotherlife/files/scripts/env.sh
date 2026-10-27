#!/usr/bin/env bash
# source this before any Android build:  source scripts/env.sh
export JAVA_HOME="$HOME/java/jdk-21.0.12.1+1/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
