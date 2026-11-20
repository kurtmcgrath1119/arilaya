import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import MapPage from './pages/MapPage.jsx'
import Seller from './pages/Seller.jsx'
import Buyer from './pages/Buyer.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/seller" element={<Seller />} />
      <Route path="*" element={<Landing />} />
      <Route path="/buyer" element={<Buyer />} />
    </Routes>
  )
}