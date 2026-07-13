#!/usr/bin/env bash

set -Eeuo pipefail

branch="${1:-master}"
repo_url="${REPO_URL:-https://github.com/Alirea10/AC-AconfigPage.git}"
mirror_dir="${MIRROR_DIR:-/home/ubuntu/deploy/AC-AconfigPage.git}"
app_root="${APP_ROOT:-/www/wwwroot/autochess.alirea.top}"
releases_dir="${app_root}/releases"

if [[ ! "${branch}" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Invalid branch name: ${branch}" >&2
  exit 2
fi

mkdir -p "$(dirname "${mirror_dir}")" "${releases_dir}"

if [[ ! -d "${mirror_dir}/objects" ]]; then
  git clone --bare "${repo_url}" "${mirror_dir}"
fi

git --git-dir="${mirror_dir}" fetch --prune origin \
  "+refs/heads/${branch}:refs/heads/${branch}"

commit="$(git --git-dir="${mirror_dir}" rev-parse "refs/heads/${branch}^{commit}")"
release_dir="${releases_dir}/${commit}"

cleanup_failed_release() {
  if [[ -n "${release_dir:-}" && ! -f "${release_dir}/dist/index.html" ]]; then
    git --git-dir="${mirror_dir}" worktree remove --force "${release_dir}" >/dev/null 2>&1 || true
  fi
}
trap cleanup_failed_release ERR

if [[ ! -f "${release_dir}/dist/index.html" ]]; then
  if [[ -e "${release_dir}" ]]; then
    git --git-dir="${mirror_dir}" worktree remove --force "${release_dir}" >/dev/null 2>&1 || true
  fi

  git --git-dir="${mirror_dir}" worktree add --detach "${release_dir}" "${commit}"

  (
    cd "${release_dir}"
    yarn install --frozen-lockfile --non-interactive
    yarn build
    rm -rf node_modules
  )
fi

next_link="${app_root}/current.next"
ln -sfn "${release_dir}/dist" "${next_link}"
mv -Tf "${next_link}" "${app_root}/current"
printf '%s\n' "${commit}" > "${app_root}/deployed-commit"

trap - ERR

echo "DEPLOYED_COMMIT=${commit}"
echo "DEPLOYED_PATH=${release_dir}/dist"
