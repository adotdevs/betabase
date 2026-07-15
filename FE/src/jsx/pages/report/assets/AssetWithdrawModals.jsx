import React from "react";
import {
  Button,
  Col,
  DropdownDivider,
  Form,
  InputGroup,
  Modal,
  Row,
} from "react-bootstrap";
import {
  convertFiatToUserCurrency,
  getFiatCurrencyByKey,
  getUserDisplayCurrency,
  isFiatCoin,
  isFiatNativeMatchingUserCurrency,
} from "../../../../utils/euroCoinUtils";

const AvailableBalance = ({ label, amount, onSelect }) => (
  <p
    onClick={() => onSelect(amount)}
    className="text-muted-500 cursor-pointer dark:text-muted-400 mt-2 font-sans text-sm"
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === "Enter" && onSelect(amount)}
  >
    Available: {label}
  </p>
);

const AssetWithdrawModals = ({
  modal3,
  otpModal,
  closeDeposit,
  activeBank,
  activeCrypto,
  activeBankOne,
  depositName,
  transactionDetail,
  transactionDetailId,
  NewValue,
  newCoin,
  btcBalance,
  ethBalance,
  usdtBalance,
  isUser,
  isDisable,
  isDisable2,
  isError,
  otp,
  counter,
  counterDisable,
  handlePaymentSelection,
  handleTransactionId,
  handleTransaction,
  postUserTransaction,
  verifyOtp,
  reSend,
  setOtp,
  setIsError,
  setMaxWithdrawAmount,
  getCoinPrice,
  liveBtc,
  liveEth,
}) => {
  const renderAvailableBalance = () => {
    const selectMax = (amount) => setMaxWithdrawAmount(amount);

    if (depositName === "bitcoin") {
      return (
        <AvailableBalance
          label={`${btcBalance.toFixed(8)} BTC`}
          amount={btcBalance.toFixed(8)}
          onSelect={selectMax}
        />
      );
    }
    if (depositName === "ethereum") {
      return (
        <AvailableBalance
          label={`${ethBalance.toFixed(8)} ETH`}
          amount={ethBalance.toFixed(8)}
          onSelect={selectMax}
        />
      );
    }
    if (depositName === "tether") {
      return (
        <AvailableBalance
          label={`${usdtBalance.toFixed(8)} USDT`}
          amount={usdtBalance.toFixed(8)}
          onSelect={selectMax}
        />
      );
    }
    if (isFiatCoin(depositName)) {
      const fiat = getFiatCurrencyByKey(depositName);
      return (
        <AvailableBalance
          label={`${Number(NewValue).toFixed(2)} ${fiat?.label || "EUR"}`}
          amount={NewValue}
          onSelect={selectMax}
        />
      );
    }

    const altCoins = {
      bnb: "BNB",
      xrp: "XRP",
      dogecoin: "DOGE",
      solana: "SOL",
      toncoin: "TON",
      chainlink: "LINK",
      polkadot: "DOT",
      "near protocol": "NEAR",
      "usd coin": "USDC",
      tron: "TRX",
    };

    if (altCoins[depositName]) {
      return (
        <AvailableBalance
          label={`${NewValue} ${altCoins[depositName]}`}
          amount={NewValue}
          onSelect={selectMax}
        />
      );
    }

    return null;
  };

  const renderTotalAmount = () => {
    if (depositName === "bitcoin") {
      const amountInUSD = transactionDetail.amountMinus * liveBtc;
      const converted =
        isUser?.currency === "EUR"
          ? `${(amountInUSD * 0.92).toFixed(2)} EUR`
          : `${amountInUSD.toFixed(2)} USD`;
      return (
        <span>
          BTC {transactionDetail.amountMinus} (${converted})
        </span>
      );
    }
    if (depositName === "ethereum") {
      const amountInUSD = transactionDetail.amountMinus * (liveEth || 2640);
      const converted =
        isUser?.currency === "EUR"
          ? `${(amountInUSD * 0.92).toFixed(2)} EUR`
          : `${amountInUSD.toFixed(2)} USD`;
      return (
        <span>
          ETH {transactionDetail.amountMinus} (${converted})
        </span>
      );
    }
    if (depositName === "tether") {
      const amountInUSD = transactionDetail.amountMinus * 1;
      const converted =
        isUser?.currency === "EUR"
          ? `${(amountInUSD * 0.92).toFixed(2)} EUR`
          : `${amountInUSD.toFixed(2)} USD`;
      return (
        <span>
          USDT {transactionDetail.amountMinus} (${converted})
        </span>
      );
    }
    if (isFiatCoin(depositName)) {
      return (
        <span>
          {getFiatCurrencyByKey(depositName)?.label || "EUR"}{" "}
          {Number(transactionDetail.amountMinus || 0).toFixed(2)}
          {!isFiatNativeMatchingUserCurrency(depositName, isUser?.currency) && (
            <>
              {" "}
              (
              {convertFiatToUserCurrency(
                transactionDetail.amountMinus,
                depositName,
                isUser?.currency
              ).toFixed(2)}{" "}
              {getUserDisplayCurrency(isUser?.currency)})
            </>
          )}
        </span>
      );
    }
    const amountInUSD =
      transactionDetail.amountMinus * getCoinPrice(newCoin.coinSymbol);
    const converted =
      isUser?.currency === "EUR"
        ? `${(amountInUSD * 0.92).toFixed(2)} EUR`
        : `${amountInUSD.toFixed(2)} USD`;
    return (
      <span className="uppercase">
        <span style={{ textTransform: "uppercase" }}>{newCoin.coinSymbol} </span>
        {transactionDetail.amountMinus} (${converted})
      </span>
    );
  };

  return (
    <>
      {modal3 && (
        <Modal className="fade modal89" show={modal3} onHide={closeDeposit} centered>
          <Modal.Header className="d-block">
            <div className="d-flex justify-content-between align-items-center">
              <Modal.Title>Create new Withdrawal</Modal.Title>
              <Button variant="" onClick={closeDeposit} className="btn-close" />
            </div>
            <div className="mt-3 axs text-center">
              <button
                type="button"
                className={
                  activeBank
                    ? "btn btn-outline-primary me-2"
                    : "btn btn-primary btn me-2"
                }
                onClick={activeCrypto}
              >
                Crypto Withdraw
              </button>
              <button
                type="button"
                className={
                  activeBank ? "btn btn-primary" : "btn btn-outline-primary"
                }
                onClick={activeBankOne}
              >
                Bank/Card Withdraw
              </button>
            </div>
          </Modal.Header>
          <Modal.Body>
            <h6 className="font-heading text-muted-400 text-sm font-medium leading-6">
              Selected Currency:{" "}
              <span
                className="inline-block px-3 bgact font-sans transition-shadow duration-300 py-1.5 text-xs rounded-md bg-info-500 dark:bg-info-500 text-white"
                style={{ textTransform: "capitalize" }}
              >
                {depositName}
              </span>
            </h6>
            <div className="pt-3">
              <div className="mb-3">
                <label htmlFor="withdraw-amount">Amount</label>
                <input
                  id="withdraw-amount"
                  type="number"
                  onFocus={() => {
                    window.onwheel = () => false;
                  }}
                  onBlur={() => {
                    window.onwheel = null;
                  }}
                  onKeyDown={(e) =>
                    ["ArrowUp", "ArrowDown", "e", "E", "+", "-", "*", ""].includes(
                      e.key
                    ) && e.preventDefault()
                  }
                  onChange={handleTransaction}
                  value={transactionDetail.amountMinus}
                  name="amountMinus"
                  placeholder="Ex: 0.00000000"
                  className="form-control"
                />
                {renderAvailableBalance()}
              </div>
            </div>
            <DropdownDivider />
            <div className="border-top pt-4 mt-2">
              {activeBank ? (
                <>
                  <h3 className="text-muted-400 font-heading text-base font-medium">
                    Payment Method
                  </h3>
                  <Form.Group className="mt-3">
                    <Form.Control as="select" onChange={handlePaymentSelection}>
                      <option>Select a Payment Method</option>
                      {isUser?.payments?.length > 0 ? (
                        isUser.payments.map((item, index) => (
                          <option key={index}>
                            {item.type === "bank"
                              ? item.bank.accountName
                              : `${item.card.cardCategory.toUpperCase()} *${item.card.cardNumber.slice(-4)}`}
                          </option>
                        ))
                      ) : (
                        <option disabled>No payment methods available</option>
                      )}
                    </Form.Control>
                  </Form.Group>
                </>
              ) : (
                <>
                  <h3 className="text-muted-400 font-heading text-base font-medium">
                    Transaction details
                  </h3>
                  <Row className="mt-4">
                    <Form.Group controlId="formGridReceivingAddress">
                      <Form.Label>Receiving Address</Form.Label>
                      <InputGroup>
                        <Form.Control
                          type="text"
                          onChange={handleTransactionId}
                          value={transactionDetailId.txId}
                          name="txId"
                          placeholder="Ex: 0x1234567890"
                        />
                        <InputGroup.Text>
                          <i className="fas fa-wallet" />
                        </InputGroup.Text>
                      </InputGroup>
                    </Form.Group>
                  </Row>
                </>
              )}
              <Row className="mt-4">
                <Col>
                  <h5 className="text-muted-400 font-heading text-base font-medium">
                    Total Amount
                  </h5>
                </Col>
                <Col>
                  <p className="mb-0 nui-label text-sm lks">{renderTotalAmount()}</p>
                </Col>
              </Row>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={closeDeposit} variant="danger light">
              Cancel
            </Button>
            {activeBank ? (
              <Button
                onClick={() => postUserTransaction("bank", true)}
                disabled={isDisable}
                variant="primary"
              >
                Create
              </Button>
            ) : (
              <Button
                onClick={() => postUserTransaction("crypto", true)}
                disabled={isDisable}
                variant="primary"
              >
                Create
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      )}

      {otpModal && (
        <Modal className="fade modal89" show={otpModal} onHide={closeDeposit} centered>
          <Modal.Header className="d-block">
            <div className="d-flex justify-content-between align-items-center w-100">
              <Modal.Title>Two-Factor Authentication</Modal.Title>
              <Button variant="" onClick={closeDeposit} className="btn-close" />
            </div>
          </Modal.Header>
          <Modal.Body>
            <h6 className="font-heading text-muted-400 text-sm mb-3">
              For your security, we&apos;ve sent a <strong>6-digit verification code </strong>
              to your registered email address. Please enter the code below to continue with
              your withdrawal.
            </h6>
            <div className="mb-3">
              <input
                type="text"
                maxLength={6}
                className="form-control text-center fw-semibold fs-5"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, ""));
                  setIsError({ show: false, type: "" });
                }}
              />
              {isError.show && (
                <small className="text-danger d-block mt-1 fw-semibold">
                  {isError.type}
                </small>
              )}
            </div>
            <div className="text-center">
              <Button
                variant="outline-primary"
                size="sm"
                disabled={isDisable2 || counterDisable}
                onClick={reSend}
              >
                {counterDisable ? `Resend in ${counter}s` : "Resend OTP"}
              </Button>
            </div>
            <DropdownDivider />
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={closeDeposit} variant="danger light">
              Cancel
            </Button>
            {activeBank ? (
              <Button
                onClick={() => verifyOtp("bank")}
                disabled={isDisable || otp.length !== 6}
                variant="primary"
              >
                Verify & Withdraw
              </Button>
            ) : (
              <Button
                onClick={() => verifyOtp("crypto")}
                disabled={isDisable || otp.length !== 6}
                variant="primary"
              >
                Verify & Withdraw
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
};

export default AssetWithdrawModals;
