#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Check if a version number is provided as an argument.
if [ -z "$1" ];
then
  echo "Error: No version specified."
  echo "Usage: ./release.sh <version>"
  exit 1
fi

VERSION=$1
ARCHIVE_NAME="simple-fsrs"
DOWNLOADS_DIR="$HOME/Downloads"
RELEASE_ZIP_PATH="$DOWNLOADS_DIR/$ARCHIVE_NAME.zip"

echo "📦 Starting release process for version $VERSION..."

# 1. Update version numbers in package.json, manifest.json and versions.json
# The `npm version` command updates package.json and package-lock.json.
# It also runs the `version` script from package.json, which you've configured
# to execute `version-bump.mjs`.
echo "Updating version numbers to $VERSION..."
npm version $VERSION --no-git-tag-version --allow-same-version

# 2. Build the plugin using your existing build command.
echo "Building the plugin..."
npm run build

# 3. Create the zip archive for the release.
echo "Creating zip archive at $RELEASE_ZIP_PATH..."

# Create a temporary directory to avoid including other files from your repo.
TMP_DIR=$(mktemp -d)

# Copy the release files to the temporary directory.
cp main.js styles.css manifest.json "$TMP_DIR"

# Create the zip file from the contents of the temporary directory.
(cd "$TMP_DIR" && zip -r "$RELEASE_ZIP_PATH" .)

# 4. Clean up the temporary directory.
rm -rf "$TMP_DIR"

# 5. Commit the version changes and create a git tag.
echo "Committing version changes and tagging..."
git add manifest.json versions.json package.json package-lock.json
git commit -m "chore(release): v$VERSION"
git tag "v$VERSION"

echo "✅ Successfully created release archive at $RELEASE_ZIP_PATH"
echo "👉 Don't forget to run 'git push && git push --tags' to publish the release."