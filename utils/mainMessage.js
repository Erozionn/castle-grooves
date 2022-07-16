let mainMessage

const sendMessage = async (channel, options) => {
  if (channel.id === mainMessage?.channel.id) {
    mainMessage = await mainMessage.edit(options)
  } else {
    mainMessage = await channel.send(options)
  }
  return mainMessage
}

const getMainMessage = () => mainMessage

const deleteMessage = () => {
  mainMessage?.delete()
  mainMessage = null
}

export { sendMessage, getMainMessage, deleteMessage }
