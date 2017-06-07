const TOKEN_KEY = "swagger-editor-token"
const CONTENT_KEY = "swagger-editor-content"
const CONTENT_SHA_KEY = "swagger-editor-content-sha"

let localStorage = window.localStorage

export const updateSpec = (ori) => (...args) => {
  let [spec] = args
  ori(...args)
  saveContentToStorage(spec)
}

export default function(system) {
  // setTimeout runs on the next tick
  setTimeout(() => {
    if(!localStorage.getItem(TOKEN_KEY)) {
      const token = window.prompt("github token")
      localStorage.setItem(TOKEN_KEY, token)
    }
    const token = localStorage.getItem(TOKEN_KEY)
    window.fetch("https://api.github.com/repos/sagelabs/monoenki/contents/backend/app/api/swagger.yml", {
      headers: {
        Authorization: "token " + token,
        Accept: "application/vnd.github.v3"
      }
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

