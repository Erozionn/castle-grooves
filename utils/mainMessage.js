let mainMessage

const sendMessage = (channel, options) => {
  console.log(options)
  mainMessage = channel.send(options)
  return mainMessage
}

export default sendMessage
