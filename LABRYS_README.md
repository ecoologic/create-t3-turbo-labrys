# README

The common [README.md](../README.md]) is the default from [t3 create turbo app](https://github.com/t3-oss/create-t3-turbo.git). Our goal is to have a custom template but still be able to pull the changes from t3. So we decided NOT to make any change to the files existing in t3, but just add new folder/files.

So this file exists to explain how we use this custom template to kick off an initial project.

## 1. Local setup

Before using this template, sync it with t3:

1. [Go to the repo](https://github.com/Labrys-Group/create-t3-turbo/actions/workflows/sync-upstream.yml)
2. Click "Run workflow"

```sh
# You can still merge the old way with git `pull --no-rebase`
git config --global pull.rebase
git config --global branch.autoSetupRebase always

nvm install
npm install --global pnpm
pnpm install
pnpm format:fix # Prettier
pnpm lint:fix
pnpm test
# Fix and commit if necessary
```

## 2. Improve our template

Complete at least one task from the [project](https://github.com/Labrys-Group/create-t3-turbo/projects?query=is%3Aopen).

## 3. Use the template

```sh
# In your project folder
npx create-turbo@latest -e https://github.com/Labrys-Group/create-t3-turbo
```
