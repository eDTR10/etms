
import { Link } from 'react-router-dom'

interface NavLinkProps {
  to: string;
  text: string;
}

function NavLink({ to, text }: NavLinkProps) {
  return (
    <Link className=" hover:font-semibold transition-all duration-75" to={to} >{text}</Link>
  )
}

export default NavLink