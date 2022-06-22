let mainMessage

const sendMessage = async (channel, options) => {
  console.log(mainMessage)

  if (channel.id === mainMessage?.channel.id) {
    mainMessage = await mainMessage.edit(options)
  } else {
    mainMessage = await channel.send(options)
  }
  return mainMessage
}

export default sendMessage
