import {useState} from 'react'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Login from './pages/Login'
import Signup from './pages/Signup'
import { BrowserRouter , Routes, Route } from 'react-router-dom'
function App() {


  return ( 
    <div>
      <BrowserRouter>
      <Routes>
        <Route path='/dashboard' element={<Dashboard/>}></Route>
        <Route path='/alerts' element={<Alerts/>}></Route>
        <Route path='/' element={<Login/>}></Route>
        <Route path='/signup' element={<Signup/>}></Route>
      </Routes>
      </BrowserRouter>
    </div>
  )
}
export default App