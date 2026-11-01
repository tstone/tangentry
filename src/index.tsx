/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { persistPlayfieldImage } from './state/playfieldImage'
import { persistProject } from './state/project'
import { trackHistory } from './state/history'

persistProject()
persistPlayfieldImage()
trackHistory()

const root = document.getElementById('root')

render(() => <App />, root!)
