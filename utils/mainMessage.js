let mainMessage

const getMainMessage = () => mainMessage

const deleteMessage = () => {
  mainMessage?.delete()
  mainMessage = null
}

const sendMessage = async (channel, options) => {
  if (channel.id === mainMessage?.channel.id) {
    mainMessage = await mainMessage.edit(options)
  } else {
    if (mainMessage) {
      deleteMessage()
    }
    mainMessage = await channel.send(options)
  }
  return mainMessage
}

export { sendMessage, getMainMessage, deleteMessage }
