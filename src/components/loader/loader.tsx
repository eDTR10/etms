import './loader.css'
const Loader = () => {
  return (
    <div className='flex items-center justify-center w-screen h-screen bg-background '>
<svg className='loading' viewBox="25 25 50 50">
  <circle className='loading-circle' r="20" cy="50" cx="50"></circle>
</svg>
    </div>
    
  )
}

export default Loader