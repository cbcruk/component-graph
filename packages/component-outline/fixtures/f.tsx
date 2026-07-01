import { Component } from 'react';

interface CounterProps {
  start: number;
}

export class Counter extends Component<CounterProps> {
  render() {
    return (
      <div className="counter">
        <span>{this.props.start}</span>
      </div>
    );
  }
}

class Hidden extends Component {
  render() {
    return <em>hidden</em>;
  }
}
