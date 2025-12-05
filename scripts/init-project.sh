#!/bin/bash

# Abort if git status is not clean
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: Git working directory must be clean."
  exit 1
fi

# Remove MIT license
sed -i '' '/"license": "MIT",/d' package.json
sed -i '' '/"license": "MIT",/d' packages/ui/package.json
sed -i '' '/"license": "MIT",/d' packages/auth/package.json
sed -i '' '/"license": "MIT",/d' packages/db/package.json
sed -i '' '/"license": "MIT",/d' packages/api/package.json
sed -i '' '/"license": "MIT",/d' packages/validators/package.json
rm LICENSE

# Prep the readme for _this_ project
rm README.md
rm LABRYS-README.md
mv PROJECT-README.md README.md
rm scripts/init-project.sh # What a selfless hero!

git add --all
git commit -m "chore: ./scripts/init-project.sh"

echo "Now make README.md relevant to your project!"
