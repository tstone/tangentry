/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { persistPlayfieldImage } from './state/playfieldImage'
import { persistProject } from './state/project'

persistProject()
persistPlayfieldImage()

const root = document.getElementById('root')

render(() => <App />, root!)
