import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedAdminRoute from './components/admin/ProtectedAdminRoute'
import Layout from './components/Layout'
import Home from './pages/Home'
import Book from './pages/Book'
import BookingSuccess from './pages/BookingSuccess'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import Settings from './pages/admin/Settings'
import Services from './pages/admin/Services'
import BlockedSlots from './pages/admin/BlockedSlots'
import Bookings from './pages/admin/Bookings'
import Schedule from './pages/admin/Schedule'
import NewBooking from './pages/admin/NewBooking'
import Analytics from './pages/admin/Analytics'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/book" element={<Book />} />
            <Route path="/booking-success" element={<BookingSuccess />} />

            {/* Admin routes */}
            <Route path="/admin/login" element={<Login />} />
            <Route
              path="/admin"
              element={
                <ProtectedAdminRoute>
                  <Dashboard />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedAdminRoute>
                  <Settings />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/services"
              element={
                <ProtectedAdminRoute>
                  <Services />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/blocked-slots"
              element={
                <ProtectedAdminRoute>
                  <BlockedSlots />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/bookings"
              element={
                <ProtectedAdminRoute>
                  <Bookings />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/bookings/new"
              element={
                <ProtectedAdminRoute>
                  <NewBooking />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/schedule"
              element={
                <ProtectedAdminRoute>
                  <Schedule />
                </ProtectedAdminRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedAdminRoute>
                  <Analytics />
                </ProtectedAdminRoute>
              }
            />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  )
}

export default App
