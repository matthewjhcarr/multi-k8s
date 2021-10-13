import React from 'react'
import {Link} from 'react-router-dom'
import catthew from './img/catthew.jpeg'

export default () => {
  return (
    <>
      <image src={catthew} alt="catthew" />
      <br />
      <Link to="/">Go home!</Link>
    </>
  )
}