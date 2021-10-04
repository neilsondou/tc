class PageTalk {
    constructor(options) {
        this.importScripts([
            'https://cdn.jsdelivr.net/npm/blueimp-md5@2.18.0/js/md5.min.js',
            'https://cdn.jsdelivr.net/npm/marked@0.6.3/marked.min.js'
        ]).then(() => {
            marked.setOptions({
                sanitize: true
            })
            this.className = options.className || 'PageTalk_Comment'
            this.lcs = new LeanCloudStorage(options)
            this.listComments()
        })

        this.emailReg = /^[a-zA-Z0-9_\-\.]+\@[a-zA-Z0-9_\-\.]+\.([a-zA-Z]{2,8})$/
        this.urlReg = /^https?:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z0-9\-\.]+(\:\d+)?[\w\-\/\.@?=%&+#]*$/
        this.avatar = ''
        this.onMessage = options.onMessage || function() {}
        this.createHeader(options.container)
    }

    createHeader(container) {
        container = document.querySelector(container)
        container.innerHTML = ''

        const user = this.loadLastUser()
        const header = this._(`
        <div class="mdchat-container">
        <div class="mdchat-section">
        <div class="mdchat-form">
        <div class="mdchat-form-inputs">
        <input type="text" id="mdchat-nickname" value="${user.nickname}" maxlength="15" placeholder="昵称" class="mdui-textfield-input" type="email">
        <input type="text" id="mdchat-email" value="${user.email}" maxlength="15" placeholder="邮箱" class="mdui-textfield-input">
        <input type="text" id="mdchat-website" value="${user.website}" maxlength="15" placeholder="网站" class="mdui-textfield-input"></div></div>
        <div class="mdchat-textarea mdui-textfield-input" placeholder="请输入内容" contenteditable="plaintext-only"></div>
        <div class="mdchat-controls">
        <div class="mdchat-badge">
        <div class="mdchat-message mdui-container-fluid"></div>
        </div>
        <button class="mdchat-submit mdui-btn mdui-color-theme-accent mdui-ripple">发言</button>
        </div>
        </div>
        </div><div id="mdchat-comment-list"></div>
        `)

        header.querySelector('.mdchat-submit').addEventListener('click', e => this.addComment(e))
        container.appendChild(header)

        this.element = {
            nickname: header.querySelector('#mdchat-nickname'),
            email: header.querySelector('#mdchat-email'),
            website: header.querySelector('#mdchat-website'),
            textarea: header.querySelector('.mdchat-textarea'),
            message: header.querySelector('.mdchat-message'),
            submit: header.querySelector('.mdchat-submit'),
            comments: header.querySelector('#mdchat-comment-list')
        }
    }

    async listComments() {
        this.setMessage(`正在加载...`)
        const res = await this.lcs.queryObjects(`select * from ${this.className} where pageId = '${location.pathname}' order by createdAt desc`)
        if (res.error) {
            return this.setMessage(res.error, true)
        }

        this.setMessage(`共 ${res.results.length} 条发言`)
        res.results.forEach(comment => {
            const markedComment = this.markComment(comment)
            const section = this.createSection(markedComment)
            this.element.comments.appendChild(section)
        })
    }

    async addComment(e) {
        const textarea = this.element.textarea
        const comment = {
            nickname: this.element.nickname.value.trim(),
            email: this.element.email.value.trim(),
            website: this.element.website.value.trim(),
            content: (textarea.orginalContent || textarea.textContent).trim(),
            pageId: location.pathname
        }
        let res = this.verifyFormData(comment)
        if (res !== true) {
            return this.setMessage(res, true)
        }

        this.element.submit.disabled = true
        res = await this.lcs.insertObject(this.className, comment)
        this.element.submit.disabled = false
        if (res.error) {
            return this.setMessage(res.error, true)
        }

        comment.objectId = res.objectId
        comment.createdAt = res.createdAt
        const markedComment = this.markComment(comment)
        const section = this.createSection(markedComment)
        const list = this.element.comments.children

        if (list.length === 0) {
            this.element.comments.appendChild(section)
        } else {
            this.element.comments.insertBefore(section, list[0])
        }

        this.setMessage(`共 ${list.length} 条发言`)
        this.clearPreview()
        this.saveLastUser(markedComment)
        this.onMessage(markedComment)
    }

    createSection(comment) {
        const item = this._(`
        <div class="mdui-typo">
        <blockquote>
        <div class="mdchat-section">
        <div class="mdchat-comment">
        <div class="mdchat-profile">
        <div></div><footer>
        ${comment.nickname}</footer>
        <svg id="mdchat-reply-icon" viewBox="0 0 1332 1024" width="14">
        <path d="M529.066665 273.066666 529.066665 0 51.2 477.866666 529.066665 955.733335 529.066665 675.84C870.4 675.84 1109.333335 785.066665 1280 1024 1211.733335 682.666665 1006.933335 341.333334 529.066665 273.066666"></path></svg>
        </div>
        <div class="mdchat-markdown">
        ${comment.htmlContent}</div></div></div></blockquote></div>`)
        item.querySelector('#mdchat-reply-icon').addEventListener('click', e => this.reply(comment))
        return item
    }

    reply(comment) {
        const lines = comment.content.split('\n')
        lines.forEach((line, i) => lines[i] = '> ')
        lines.unshift('> @' + comment.nickname)
        lines.push('\n\n')

        this.element.textarea.textContent = lines.join('\n')
        this.moveCursorToEnd(this.element.textarea)
    }

    markComment(comment) {
        comment.avatar = this.avatar
        comment.createdAt = this.formatDate(comment.createdAt)
        comment.htmlContent = marked(comment.content)
        return comment
    }

    verifyFormData(comment) {
        if (!comment.nickname) {
            return '不知道自己叫什么？'
        }
        if (comment.nickname.match(/[\<\>]+/)) {
            return '注入？'
        }
        if (comment.email && !comment.email.match(this.emailReg)) {
            return '不知道自己邮箱？'
        }
        if (comment.website && !comment.website.match(this.urlReg)) {
            return '不会填网站？'
        }
        if (!comment.content) {
            return '什么都不说你发什么？'
        }
        if (comment.content.length > 2000) {
            return ' 你想在这里发paper？'
        }
        return true
    }


    setMessage(message, isError = false) {
        this.element.message.innerHTML = message
        if (isError) {
            this.element.message.classList.add('mdchat-error')
        } else {
            this.element.message.classList.remove('mdchat-error')
        }
    }

    saveLastUser(comment) {
        localStorage.setItem('pagetalk-user', JSON.stringify({
            nickname: comment.nickname,
            email: comment.email,
            website: comment.website,
            avatar: comment.avatar
        }))
    }

    loadLastUser() {
        const user = JSON.parse(localStorage.getItem('pagetalk-user')) || {}
        user.nickname = user.nickname || ''
        user.email = user.email || ''
        user.website = user.website || ''
        user.avatar = user.avatar || this.avatar
        return user
    }

    formatDate(time) {
        time = (new Date(time)).getTime() + 8 * 3600 * 1000
        return (new Date(time)).toJSON().substr(0, 10).replace(/\-/g, '/')
    }

    moveCursorToEnd(element) {
        element.focus()
        element.scrollTop = element.scrollHeight - element.clientHeight

        if (window.getSelection) {
            const range = window.getSelection()
            range.selectAllChildren(element)
            range.collapseToEnd()
        } else if (document.selection) {
            const range = document.selection.createRange()
            range.moveToElementText(element)
            range.collapse(false)
            range.select()
        }
    }

    importScripts(urls) {
        return new Promise((resolve, reject) => {
            const head = document.getElementsByTagName('head')[0]
            const load = i => {
                const script = document.createElement('script')
                script.setAttribute('type', 'text/javaScript')
                script.setAttribute('src', urls[i])
                script.onload = script.onerror = () => {
                    i++
                    if (i === urls.length) resolve()
                    else load(i)
                }
                head.appendChild(script)
            }
            load(0)
        })
    }

    _(selector) {
        selector = selector.replace('/\n/mg', '').trim()
        if (selector.startsWith('<')) {
            const fragment = document.createRange().createContextualFragment(selector)
            return fragment.firstChild
        }
        return document.querySelector(selector)
    }
}

class LeanCloudStorage {
    constructor(options) {
        this.api = 'https://avoscloud.com/1.1'
        this.defaultHeaders = {
            'X-LC-Id': options.appId,
            'X-LC-Key': options.appKey,
            'Content-Type': 'application/json'
        }
    }

    async queryObjects(cql) {
        return await this.tryFetch(`/cloudQuery?cql=${cql}`)
    }

    async getObjects(className) {
        return await this.tryFetch(`/classes/${className}`)
    }

    async insertObject(className, object) {
        return await this.tryFetch(`/classes/${className}`, {
            method: 'POST',
            body: JSON.stringify(object)
        })
    }

    async deleteObject(className, objectId) {
        return await this.tryFetch(`/classes/${className}/${objectId}`, {
            method: 'DELETE'
        })
    }

    async tryFetch(url, options = {}) {
        options.headers = this.defaultHeaders
        try {
            const response = await fetch(this.api + url, options)
            return await response.json()
        } catch (e) {
            return {
                error: e.message
            }
        }
    }
}