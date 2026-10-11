import {useState} from 'react'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Landing from './pages/Landing'
import CameraSetup from './pages/CameraSetup'
import EntryKiosk from './pages/EntryKiosk'
import { BrowserRouter , Routes, Route } from 'react-router-dom'
function App() {


  return ( 
    <div>
      <BrowserRouter>
      <Routes>
        <Route path='/' element={<Landing/>}></Route>
        <Route path='/login' element={<Login/>}></Route>
        <Route path='/camera' element={<CameraSetup/>}></Route>
        <Route path='/kiosk' element={<EntryKiosk/>}></Route>
        <Route path='/dashboard' element={<Dashboard/>}></Route>
        <Route path='/alerts' element={<Alerts/>}></Route>
        <Route path='/signup' element={<Signup/>}></Route>
      </Routes>
      </BrowserRouter>
    </div>
  )
}
export default App