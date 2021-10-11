import axios from 'axios'
import React, { Component } from 'react'

class Fib extends Component {
  state = {
    seenIndices: [],
    values: {},
    index: ''
  }

  // called if component is rendered
  componentDidMount() {
    this.fetchValues()
    this.fetchIndices()
  }

  async fetchValues() {
    const values = await axios.get('/api/values/current')
    this.setState({ values: values.data })
  }

  async fetchIndices() {
    const seenIndices = await axios.get('/api/values/all')
    this.setState({ seenIndices: seenIndices.data})
  }

  handleSubmit = async (event) => {
    event.preventDefault()

    await axios.post('/api/values', {
      index: this.state.index
    })

    this.setState({ index: '' })
  }

  // pulls out the number from the objects within seenIndices and adds a comma and a space between them
  renderSeenIndices() {
    return this.state.seenIndices.map(({ number }) => number).join(', ')
  }

  renderValues() {
    const entries = []

    for (let key in this.state.values) {
      entries.push(
        <div key={key}>
          For index {key} I calculated {this.state.values[key]}
        </div>
      )
    }

    return entries
  }

  render() {
    return (
      <>
        <form onSubmit={this.handleSubmit}>
          <label>Enter your index:</label>
          <input
            value={this.state.index}
            onChange={event => this.setState({ index: event.target.value })}
            type="text" />
            <button>Submit</button>
        </form>
        <h3>Indices I have seen:</h3>
        {this.renderSeenIndices()}
        <h3>Calculated Values:</h3>
        {this.renderValues()}
      </>
    )
  }
}

export default Fib
