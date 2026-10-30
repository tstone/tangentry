/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { persistProject } from './state/project'

persistProject()

const root = document.getElementById('root')

render(() => <App />, root!)
