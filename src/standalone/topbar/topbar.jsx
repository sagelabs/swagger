import React, { PropTypes } from "react"
import Swagger from "swagger-client"
import "whatwg-fetch"
import DropdownMenu from "./DropdownMenu"
import Modal from "boron/DropModal"
import downloadFile from "react-file-download"
import YAML from "js-yaml"
import beautifyJson from "json-beautify"

import "react-dd-menu/dist/react-dd-menu.css"
import "./topbar.less"
import Logo from "./logo_small.png"

const TOKEN_KEY = "swagger-editor-token"
const CONTENT_SHA_KEY = "swagger-editor-content-sha"
const NAME_KEY = "swagger-editor-name"

function getOrCreateBranchAndGetContentSha(token, branch) {
  return window.fetch("https://api.github.com/repos/sagelabs/monoenki/branches/" + branch, {
    headers: {
      Authorization: "token " + token,
      Accept: "application/vnd.github.v3"
    }
  }).then(res => {
    if (res.status === 404) {
      return window.fetch("https://api.github.com/repos/sagelabs/monoenki/git/refs/heads/develop", {
        headers: {
          Authorization: "token " + token,
          Accept: "application/vnd.github.v3"
        },
      }).then((res) => res.json())
      .then((res) => window.fetch("https://api.github.com/repos/sagelabs/monoenki/git/refs", {
        method: "POST",
        headers: {
          Authorization: "token " + token,
          Accept: "application/vnd.github.v3"
        },
        body: JSON.stringify({
          ref: "refs/heads/" + branch,
          sha: res.object.sha
        })
      }))
    }
  })
  .then(() => {
    return window.fetch("https://api.github.com/repos/sagelabs/monoenki/contents/backend/app/api/swagger.yml?ref=" + branch, {
      headers: {
        Authorization: "token " + token,
        Accept: "application/vnd.github.v3"
      }
    }).then(res => res.json())
    .then(res => res.sha)
  })
}

export default class Topbar extends React.Component {
  constructor(props, context) {
    super(props, context)

    Swagger("https://generator.swagger.io/api/swagger.json", {
      requestInterceptor: (req) => {
        req.headers["Accept"] = "application/json"
        req.headers["content-type"] = "application/json"
      }
    })
      .then(client => {
        this.setState({ swaggerClient: client })
        client.apis.clients.clientOptions()
          .then(res => {
            this.setState({ clients: res.body })
          })
        client.apis.servers.serverOptions()
          .then(res => {
            this.setState({ servers: res.body })
          })
      })

    this.state = {
      swaggerClient: null,
      clients: [],
      servers: []
    }
  }

  // Menu actions

  importFromURL = () => {
    let url = prompt("Enter the URL to import from:")

    if(url) {
      this.props.specActions.updateUrl(url)
      this.props.specActions.download(url)
    }
  }

  importFromFile = () => {
    let [fileToLoad] = this.refs.fileLoadInput.files

    let fileReader = new FileReader()

    fileReader.onload = fileLoadedEvent => {
      let textFromFileLoaded = fileLoadedEvent.target.result
      this.props.specActions.updateSpec(textFromFileLoaded)
      this.hideModal()
    }

    fileReader.readAsText(fileToLoad, "UTF-8")
  }

  saveAsYaml = () => {
    // Editor content -> JS object -> YAML string
    let editorContent = this.props.specSelectors.specStr()
    let jsContent = YAML.safeLoad(editorContent)
    let yamlContent = YAML.safeDump(jsContent)
    downloadFile(yamlContent, "swagger.yaml")
  }

  saveAsJson = () => {
    // Editor content -> JS object -> YAML string
    let editorContent = this.props.specSelectors.specStr()
    let jsContent = YAML.safeLoad(editorContent)
    let prettyJsonContent = beautifyJson(jsContent, null, 2)
    downloadFile(prettyJsonContent, "swagger.json")
  }

  saveAsText = () => {
    // Editor content -> JS object -> YAML string
    let editorContent = this.props.specSelectors.specStr()
    downloadFile(editorContent, "swagger.txt")
  }

  saveAsPR = () => {
    let editorContent = this.props.specSelectors.specStr()
    let jsContent = YAML.safeLoad(editorContent)
    let yamlContent = YAML.safeDump(jsContent)

    if(!localStorage.getItem(TOKEN_KEY)) {
      const token = window.prompt("github token")
      localStorage.setItem(TOKEN_KEY, token)
    }
    const token = localStorage.getItem(TOKEN_KEY)
    const commitMessage = prompt("Commit message")
    const branchName = "swagger-" + localStorage.getItem(CONTENT_SHA_KEY) + localStorage.getItem(NAME_KEY)

    getOrCreateBranchAndGetContentSha(token, branchName)
    .then((sha) => window.fetch("https://api.github.com/repos/sagelabs/monoenki/contents/backend/app/api/swagger.yml", {
        method: "PUT",
        headers: {
          Authorization: "token " + token,
          Accept: "application/vnd.github.v3"
        },
        body: JSON.stringify({
          path: "backend/app/api/swagger.yml",
          message: commitMessage,
          content: window.btoa(yamlContent),
          sha: sha,
          branch: branchName
        })
      })
    )
    .then(() => window.fetch("https://api.github.com/repos/sagelabs/monoenki/pulls", {
        method: "POST",
        headers: {
          Authorization: "token " + token,
          Accept: "application/vnd.github.v3"
        },
        body: JSON.stringify({
          title: "Update swagger API definition",
          base: "develop",
          head: branchName
        })
      }))
    .catch(console.error)
  }

  convertToYaml = () => {
    // Editor content -> JS object -> YAML string
    let editorContent = this.props.specSelectors.specStr()
    let jsContent = YAML.safeLoad(editorContent)
    let yamlContent = YAML.safeDump(jsContent)
    this.props.specActions.updateSpec(yamlContent)
  }

  downloadGeneratedFile = (type, name) => {
    let { specSelectors } = this.props
    let swaggerClient = this.state.swaggerClient
    if(!swaggerClient) {
      // Swagger client isn't ready yet.
      return
    }
    if(type === "server") {
      swaggerClient.apis.servers.generateServerForLanguage({
        framework : name,
        body: JSON.stringify({
          spec: specSelectors.specResolved()
        }),
        headers: JSON.stringify({
          Accept: "application/json"
        })
      })
        .then(res => handleResponse(res))
    }

    if(type === "client") {
      swaggerClient.apis.clients.generateClient({
        language : name,
        body: JSON.stringify({
          spec: specSelectors.specResolved()
        })
      })
        .then(res => handleResponse(res))
    }

    function handleResponse(res) {
      if(!res.ok) {
        return console.error(res)
      }

      fetch(res.body.link)
        .then(res => res.blob())
        .then(res => {
          downloadFile(res, `${name}-${type}-generated.zip`)
        })
    }

  }

  clearEditor = () => {
    if(window.localStorage) {
      window.localStorage.removeItem("swagger-editor-content")
      this.props.specActions.updateSpec("")
    }
  }

  // Helpers

  showModal = () => {
    this.refs.modal.show()
  }

  hideModal = () => {
    this.refs.modal.hide()
  }

  render() {
    let { getComponent } = this.props
    const Link = getComponent("Link")

    let makeMenuOptions = (name) => {
      let stateKey = `is${name}MenuOpen`
      let toggleFn = () => this.setState({ [stateKey]: !this.state[stateKey] })
      return {
        isOpen: !!this.state[stateKey],
        close: () => this.setState({ [stateKey]: false }),
        align: "left",
        toggle: <span className="menu-item" onClick={toggleFn}>{ name }</span>
      }
    }

    return (
      <div>
        <div className="topbar">
          <div className="topbar-wrapper">
            <Link href="#">
              <img height="30" width="30" className="topbar-logo__img" src={ Logo } alt=""/>
              <span className="topbar-logo__title">Swagger Editor</span>
            </Link>
            <DropdownMenu {...makeMenuOptions("File")}>
              <li><button type="button" onClick={this.importFromURL}>Import URL</button></li>
              <li><button type="button" onClick={this.showModal}>Import File</button></li>
              <li role="separator"></li>
              <li><button type="button" onClick={this.saveAsYaml}>Download YAML</button></li>
              <li><button type="button" onClick={this.saveAsJson}>Download JSON</button></li>
              <li role="separator"></li>
              <li><button type="button" onClick={this.saveAsPR}>Open PR with changes</button></li>
              <li role="separator"></li>
              <li><button type="button" onClick={this.clearEditor}>Clear editor</button></li>
            </DropdownMenu>
            <DropdownMenu {...makeMenuOptions("Edit")}>
              <li><button type="button" onClick={this.convertToYaml}>Convert to YAML</button></li>
            </DropdownMenu>
            <DropdownMenu className="long" {...makeMenuOptions("Generate Server")}>
              { this.state.servers
                  .map(serv => <li key={serv}><button type="button" onClick={this.downloadGeneratedFile.bind(null, "server", serv)}>{serv}</button></li>) }
            </DropdownMenu>
            <DropdownMenu className="long" {...makeMenuOptions("Generate Client")}>
              { this.state.clients
                  .map(cli => <li key={cli}><button type="button" onClick={this.downloadGeneratedFile.bind(null, "client", cli)}>{cli}</button></li>) }
            </DropdownMenu>
          </div>
        </div>
        <Modal className="swagger-ui modal" ref="modal">
          <div className="container">
            <h2>Upload file</h2>
            <input type="file" ref="fileLoadInput"></input>
          </div>
          <div className="right">
            <button className="btn cancel" onClick={this.hideModal}>Cancel</button>
            <button className="btn" onClick={this.importFromFile}>Open file</button>
          </div>
        </Modal>
      </div>

    )
  }
}

Topbar.propTypes = {
  specSelectors: PropTypes.object.isRequired,
  specActions: PropTypes.object.isRequired,
  getComponent: PropTypes.func.isRequired
}
