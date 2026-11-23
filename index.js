const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

process.on('uncaughtException', (err) => {
  console.error('[CRASH UNCAUGHT]', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[CRASH REJECTION]', err);
});

let config;
try {
  const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  config = JSON.parse(raw);
} catch (err) {
  console.error('[CONFIG ERROR] Impossible de lire config.json :', err.message);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const STAFF_META = {
  label: config.staffRecruitment?.label || 'Recrutement Staff',
  emoji: config.staffRecruitment?.emoji || '🛡️',
  description:
    config.staffRecruitment?.description ||
    'Rejoindre l’équipe staff pour aider la communauté et gérer les tickets',
  acceptedRoleId: config.staffRecruitment?.acceptedRoleId || '',
};

function buildStaffPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle(`${STAFF_META.emoji} ${STAFF_META.label} — Aria RP`)
    .setDescription(
      `${STAFF_META.description}\n\nClique sur **Postuler Staff** ci-dessous pour remplir ta candidature.`
    )
    .setColor(0x5865f2);

  const applyBtn = new ButtonBuilder()
    .setCustomId('open_staff_modal')
    .setLabel('Postuler Staff')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(applyBtn)],
  };
}

function buildStaffModal() {
  const modal = new ModalBuilder()
    .setCustomId('modal_staff_application')
    .setTitle('Candidature Staff');

  const ageDispo = new TextInputBuilder()
    .setCustomId('staff_age_dispo')
    .setLabel('Âge et disponibilités')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex : 18 ans, disponible tous les soirs et le week-end')
    .setRequired(true);

  const experience = new TextInputBuilder()
    .setCustomId('staff_experience')
    .setLabel('Expérience en modération / staff')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Tes anciennes expériences staff, outils connus, etc.')
    .setRequired(true);

  const gestionConflits = new TextInputBuilder()
    .setCustomId('staff_conflits')
    .setLabel('Comment gères-tu un joueur énervé ou un litige ?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Explique ta façon de garder ton calme et d’être impartial...')
    .setRequired(true);

  const motivations = new TextInputBuilder()
    .setCustomId('staff_motivations')
    .setLabel('Pourquoi veux-tu rejoindre le staff ?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Tes motivations pour aider le serveur...')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ageDispo),
    new ActionRowBuilder().addComponents(experience),
    new ActionRowBuilder().addComponents(gestionConflits),
    new ActionRowBuilder().addComponents(motivations)
  );

  return modal;
}

function buildDecisionButtons(applicantId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_accept_${applicantId}`)
      .setLabel('Accepter')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`staff_refuse_${applicantId}`)
      .setLabel('Refuser')
      .setStyle(ButtonStyle.Danger)
  );
}

async function ensureStaffPanel() {
  if (!config.panelChannelId) return;
  const channel = await client.channels.fetch(config.panelChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const exists = recent?.some(
    (m) =>
      m.author.id === client.user.id &&
      m.components.some((r) => r.components.some((c) => c.customId === 'open_staff_modal'))
  );

  if (!exists) {
    await channel.send(buildStaffPanelPayload()).catch(console.error);
  }
}

client.once('clientReady', async () => {
  console.log(`[READY] Connecté en tant que ${client.user.tag}`);
  await ensureStaffPanel();
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId === 'open_staff_modal') {
    await interaction.showModal(buildStaffModal());
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_staff_application') {
    const ageDispo = interaction.fields.getTextInputValue('staff_age_dispo');
    const experience = interaction.fields.getTextInputValue('staff_experience');
    const conflits = interaction.fields.getTextInputValue('staff_conflits');
    const motivations = interaction.fields.getTextInputValue('staff_motivations');

    const appChannel = await client.channels.fetch(config.applicationsChannelId).catch(() => null);
    if (!appChannel || !appChannel.isTextBased()) {
      await interaction.reply({
        content: '❌ Salon de candidatures staff introuvable.',
        ephemeral: true,
      });
      return;
    }

    const pings = (config.reviewerRoleIds || [])
      .filter((id) => /^\d{15,22}$/.test(id))
      .map((id) => `<@&${id}>`)
      .join(' ');

    const embed = new EmbedBuilder()
      .setTitle(`${STAFF_META.emoji} Nouvelle candidature Staff`)
      .setColor(0x5865f2)
      .addFields(
        { name: 'Candidat', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: false },
        { name: 'Âge & Disponibilités', value: ageDispo, inline: false },
        { name: 'Expérience', value: experience, inline: false },
        { name: 'Gestion des litiges', value: conflits, inline: false },
        { name: 'Motivations', value: motivations, inline: false }
      )
      .setTimestamp();

    await appChannel.send({
      content: pings || undefined,
      embeds: [embed],
      components: [buildDecisionButtons(interaction.user.id)],
    });

    await interaction.reply({
      content: '✅ Ta candidature staff a bien été envoyée à l’équipe !',
      ephemeral: true,
    });
    return;
  }

  if (
    interaction.isButton() &&
    (interaction.customId.startsWith('staff_accept_') ||
      interaction.customId.startsWith('staff_refuse_'))
  ) {
    const isAccept = interaction.customId.startsWith('staff_accept_');
    const applicantId = interaction.customId.replace(
      isAccept ? 'staff_accept_' : 'staff_refuse_',
      ''
    );

    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    const applicantUser = await client.users.fetch(applicantId).catch(() => null);
    const member = guild ? await guild.members.fetch(applicantId).catch(() => null) : null;
    const reviewerName = interaction.member?.displayName || interaction.user.username;

    if (isAccept && member && /^\d{15,22}$/.test(STAFF_META.acceptedRoleId)) {
      await member.roles.add(STAFF_META.acceptedRoleId).catch(console.error);
    }

    if (applicantUser) {
      const dm = await applicantUser.createDM().catch(() => null);
      if (dm) {
        await dm
          .send(
            isAccept
              ? `🎉 Félicitations ! Ta candidature **Staff** a été **acceptée** par **${reviewerName}**.`
              : `❌ Ta candidature **Staff** a été **refusée** par **${reviewerName}**.`
          )
          .catch(() => {});
      }
    }

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(isAccept ? 0x34d399 : 0xf87171)
      .setFooter({
        text: `${isAccept ? 'Acceptée' : 'Refusée'} par ${reviewerName}`,
      });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [],
    });
  }
});

client.login(config.token).catch((err) => {
  console.error('[LOGIN ERROR]', err.message);
  process.exit(1);
});