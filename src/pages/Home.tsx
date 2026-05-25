import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'

export default function Home() {
  return (
    <div className="text-center py-16 max-w-xl mx-auto flex flex-col items-center">
      {/* Brand Logo Shell */}
      <div className="mb-6 flex justify-center">
        <img 
          src="/logo.png" 
          alt="Groomers" 
          className="w-28 h-28 object-contain animate-fadeIn"
        />
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mt-2 mb-4 leading-tight font-sans">
        Premium Dog Grooming
      </h1>
      <p className="text-base text-slate-600 mb-8 leading-relaxed font-sans font-medium">
        Give your furry friend the love and care they deserve. Book a professional grooming session easily and manage appointments online.
      </p>
      
      <div className="flex justify-center w-full">
        <Link
          to="/book"
          className="inline-flex items-center justify-center px-8 py-3.5 border border-transparent text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <CalendarRange className="w-4 h-4" />
          <span>Book an Appointment</span>
        </Link>
      </div>
    </div>
  )
}

