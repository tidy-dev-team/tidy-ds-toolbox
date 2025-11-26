import React, { useState } from 'react'
import { Card, FormControl } from '@shell/components'
import { createShapeRectangles } from '@shared/bridge'

export function ShapeShifterUI() {
  const [count, setCount] = useState(5)
  const [status, setStatus] = useState('')

  const handleCreate = () => {
    if (count < 1 || count > 100) {
      setStatus('Count must be between 1 and 100')
      return
    }

    setStatus('Creating rectangles...')
    createShapeRectangles(count)
    setStatus('Rectangles created successfully!')
  }

  return (
    <div>
      <h2>Shape Shifter</h2>
      <Card title="Create Rectangles">
        <FormControl label="Number of rectangles">
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 0)}
            min="1"
            max="100"
          />
        </FormControl>
        <button onClick={handleCreate}>Create Rectangles</button>
        {status && <p>{status}</p>}
      </Card>
    </div>
  )
}