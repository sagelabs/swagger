const TOKEN_KEY = "swagger-editor-token"
const CONTENT_KEY = "swagger-editor-content"
const CONTENT_SHA_KEY = "swagger-editor-content-sha"
const NAME_KEY = "swagger-editor-name"

let localStorage = window.localStorage

const {REPO_URL, FILE_PATH, DEFAULT_BRANCH} = process.env

export const updateSpec = (ori) => (...args) => {
  let [spec] = args
  ori(...args)
  saveContentToStorage(spec)
}

function headers(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github.v3"
  }
}

export default function(system) {
  // setTimeout runs on the next tick
  setTimeout(() => {
    if(!localStorage.getItem(TOKEN_KEY)) {
      const token = window.prompt("Github token with repo rights (https://github.com/settings/tokens/new)")
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(NAME_KEY, Date.now())
    }
    const token = localStorage.getItem(TOKEN_KEY)
    window.fetch(REPO_URL + "/contents/" + FILE_PATH, {
      headers: headers(token)
    })
    .then(res => res.json())
    .then(res => {
      if (!localStorage.getItem(CONTENT_SHA_KEY) || localStorage.getItem(CONTENT_SHA_KEY) !== res.sha) {
        localStorage.setItem(CONTENT_SHA_KEY, res.sha)
      } else if (localStorage.getItem(CONTENT_KEY)) {
        system.specActions.updateSpec(localStorage.getItem(CONTENT_KEY))
        return
      }
      system.specActions.updateSpec(window.atob(res.content))
    })
    .catch(err => system.specActions.updateSpec(err.message))
  }, 0)
  return {
    statePlugins: {
      spec: {
        wrapActions: {
          updateSpec
        }
      }
    }
  }
}

function saveContentToStorage(str) {
  return localStorage.setItem(CONTENT_KEY, str)
}

export function saveToPR(content) {
  if(!localStorage.getItem(TOKEN_KEY)) {
    alert("You are not logged in with GitHub")
    return
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const commitMessage = prompt("Commit message")
  const branchName = "swagger-" + localStorage.getItem(CONTENT_SHA_KEY) + localStorage.getItem(NAME_KEY)

  getOrCreateBranchAndGetContentSha(token, branchName)
  .then((sha) => window.fetch(REPO_URL + "/contents/" + FILE_PATH, {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify({
        path: FILE_PATH,
        message: commitMessage,
        content: window.btoa(content),
        sha: sha,
        branch: branchName
      })
    })
  )
  .then(() => window.fetch(REPO_URL + "/pulls", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        title: "Update swagger API definition",
        base: DEFAULT_BRANCH,
        head: branchName
      })
    }))
  .catch(console.error)
}

function getOrCreateBranchAndGetContentSha(token, branch) {
  return window.fetch(REPO_URL + "/branches/" + branch, {
    headers: headers(token)
  }).then(res => {
    if (res.status === 404) {
      return window.fetch(REPO_URL + "/git/refs/heads/" + DEFAULT_BRANCH, {
        headers: headers(token),
      }).then((res) => res.json())
      .then((res) => window.fetch(REPO_URL + "/git/refs", {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          ref: "refs/heads/" + branch,
          sha: res.object.sha
        })
      }))
    }
  })
  .then(() => {
    return window.fetch(REPO_URL + "/contents/" + FILE_PATH + "?ref=" + branch, {
      headers: headers(token)
    }).then(res => res.json())
    .then(res => res.sha)
  })
}

